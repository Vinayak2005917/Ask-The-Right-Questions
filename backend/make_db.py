from utils import debug_print
debug_print("Starting make_db.py script...")
from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
import umap
import numpy as np
import json
import uuid
import os
from collections import deque
load_dotenv()
from langchain.tools import tool
if not os.getenv("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
debug_print("All Imports done")

client = QdrantClient(path="./qdrant_db")

embedding_client = OpenAI(
    base_url="https://api.aicredits.in/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)

def embedding_function(text: str):
    response = embedding_client.embeddings.create(model="text-embedding-3-large",input=text)
    return response.data[0].embedding

def load_json():
    debug_print("Starting to load all memories from memories.json")
    with open('data/memories.json', 'r') as file:
        memories = json.load(file)
    debug_print("All memories loaded from memories.json")
    return memories

#to save on costs and time, we should if the DB already exists and has everything
def DB_integrity_test(memories):
    # 1. If collection doesn't exist, create it
    if not client.collection_exists("story"):
        debug_print("Collection does not exist. Creating new collection...")
        client.create_collection(
            collection_name="story",
            vectors_config=VectorParams(
                size=3072,
                distance=Distance.COSINE
            )
        )
        return False

    # 2. Now check the count
    result = client.count(collection_name="story", exact=False)
    print(f"DB count: {result.count}")
    print(f"Memories count: {len(memories)}")

    if result.count == len(memories):
        debug_print("DB integrity test passed. All memories are already in the DB.")
        return True

    # 3. Counts don't match — recreate from scratch
    debug_print("DB integrity test failed. Deleting and Recreating the collection...")
    client.delete_collection(collection_name="story")
    client.create_collection(
        collection_name="story",
        vectors_config=VectorParams(
            size=3072,
            distance=Distance.COSINE
        )
    )
    return False

def embedd_all_memories(memories):
    all_embeddings = []
    debug_print("Starting to embed all memories...")
    for m in memories:
        emb = embedding_function(m['text'])
        all_embeddings.append(emb)
    debug_print("All Memories Embedded")
    return all_embeddings

def get_all_embedding():
    debug_print("Getting all embeddings from the DB...")
    points, _ = client.scroll(
        collection_name="story",
        with_payload=True,
        with_vectors=True,
        limit=10000
    )
    all_embeddings = [point.vector for point in points]
    debug_print("All embeddings retrieved from the DB.")
    return all_embeddings

def Calculate_UMAP_cords(all_embeddings):
    debug_print("Calculating UMAP cords")
    coords_2d = umap.UMAP(n_components=2, random_state=42).fit_transform(all_embeddings)
    debug_print("Calculated all UMAP cords")
    return coords_2d

def make_world_json(top_k=8, threshold=0.2, max_connections=4):
    debug_print(f"Making world.json with top_k={top_k}, threshold={threshold}, max_connections={max_connections}")
    points, _ = client.scroll(collection_name="story",with_payload=True,with_vectors=True,limit=10000)

    # Always keep ordering deterministic
    points.sort(key=lambda p: p.payload["id"])

    n = len(points)
    if n == 0:
        debug_print("No points found in DB.")
        return

    # Normalize vectors
    vecs = np.array([p.vector for p in points], dtype=np.float32)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1
    vecs_norm = vecs / norms

    # Cosine similarity matrix
    sim = vecs_norm @ vecs_norm.T
    ids = [p.payload["id"] for p in points]
    id_to_idx = {pid: i for i, pid in enumerate(ids)}

    # Initial Top-K graph
    adj = {pid: set() for pid in ids}
    for i in range(n):
        order = np.argsort(sim[i])[::-1]
        for j in order[1:top_k + 1]:
            if sim[i, j] >= threshold:
                adj[ids[i]].add(ids[j])


    # Mutual Neighbors
    mutual = {pid: [] for pid in ids}
    for pid in ids:
        for nid in adj[pid]:
            if pid in adj[nid]:
                mutual[pid].append(nid)

    # Keep strongest connections only
    for pid in ids:
        mutual[pid].sort(key=lambda nid: sim[id_to_idx[pid], id_to_idx[nid]],reverse=True)
        mutual[pid] = mutual[pid][:max_connections]


    # Reconnect isolated nodes
    for pid in ids:
        if len(mutual[pid]) == 0:
            i = id_to_idx[pid]
            order = np.argsort(sim[i])[::-1]
            for j in order[1:]:
                nearest = ids[j]
                mutual[pid].append(nearest)
                if pid not in mutual[nearest]:
                    mutual[nearest].append(pid)
                break


    # Find connected components
    visited = set()
    components = []
    for pid in ids:
        if pid in visited:
            continue
        q = deque([pid])
        visited.add(pid)
        component = []
        while q:
            node = q.popleft()
            component.append(node)
            for nxt in mutual[node]:
                if nxt not in visited:
                    visited.add(nxt)
                    q.append(nxt)
        components.append(component)
    debug_print(f"Found {len(components)} connected components")


    # Merge disconnected components
    while len(components) > 1:
        comp_a = components.pop()
        best_score = -1
        best_pair = None
        best_component = None
        for other in components:
            for a in comp_a:
                ia = id_to_idx[a]
                for b in other:
                    ib = id_to_idx[b]
                    if sim[ia, ib] > best_score:
                        best_score = sim[ia, ib]
                        best_pair = (a, b)
                        best_component = other
        a, b = best_pair
        mutual[a].append(b)
        mutual[b].append(a)
        best_component.extend(comp_a)


    # Remove accidental duplicates
    for pid in ids:
        mutual[pid] = sorted(set(mutual[pid]))

    # ── Recenter all UMAP coordinates to (0, 0) and apply equal scaling ──
    xs = [p.payload["X"] for p in points]
    ys = [p.payload["Y"] for p in points]
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    SCALE = 150

    world = []
    for p in points:
        world.append({
            "id": p.payload["id"],
            "text": p.payload["text"],
            "x": (p.payload["X"] - cx) * SCALE,
            "y": (p.payload["Y"] - cy) * SCALE,
            "connections": mutual[p.payload["id"]]
        })

    with open("data/world.json", "w") as f:
        json.dump(world, f, indent=2)

    debug_print(f"world.json saved with {len(world)} nodes.")

# this will be used if world.json is already made but needs calling anyways
def load_world_json():
    debug_print("Loading world.json...")
    if not os.path.exists("data/world.json"):
        debug_print("world.json does not exist. Creating world.json...")
        make_world_json(top_k=5, threshold=0.6)
    with open('data/world.json', 'r') as file:
        world = json.load(file)
    debug_print("world.json loaded.")
    return world

def upsert_all_memories(memories, all_embeddings, coords_2d):
    points = []
    debug_print("Making All PointStruct")
    for i, m in enumerate(memories):
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=all_embeddings[i],
                payload={
                    "id": m['id'],
                    "text": m['text'],
                    "X": float(coords_2d[i][0]),
                    "Y": float(coords_2d[i][1]),
                    "connections": []
                }
            )
        )
    debug_print("Starting batch upsert of all Point Struct")
    client.upsert(collection_name="story", points=points)
    debug_print("All Point Struct upserted to Qdrant DB")

def add_connections():
    debug_print("Updating DB connections...")
    world = load_world_json()
    lookup = {node["id"]: node["connections"] for node in world}

    points, _ = client.scroll(collection_name="story", with_payload=True,limit=10000)
    for point in points:
        memory_id = point.payload["id"]
        client.set_payload(
            collection_name="story",
            payload={"connections": lookup[memory_id]},
            points=[point.id]
        )

    debug_print("Connections updated.")

#retrival function/tool for k=3
@tool("Retrive_top_k", description="Retrieve the top-k most relevant memories.")
def Retrive_top_k(query: str, k: int = 5):
    results = client.query_points(
        collection_name="story",
        query=embedding_function(query),
        limit=k,
        with_payload=True,
    )
    return [point.payload for point in results.points]

def delete_DB_world():
    debug_print("Deleting Qdrant DB and world.json...")
    story_dir = "./qdrant_db/collection/story"
    if os.path.exists(story_dir):
        import shutil
        shutil.rmtree(story_dir)
    if os.path.exists("data/world.json"):
        os.remove("data/world.json")
    debug_print("Qdrant DB and world.json deleted.")

if __name__ == "__main__":
    memories = load_json()
    if not DB_integrity_test(memories):
        debug_print("DB integrity test failed. Loading all memories into the DB...")
        all_embeddings = embedd_all_memories(memories)
        coords_2d = Calculate_UMAP_cords(all_embeddings)
        upsert_all_memories(memories, all_embeddings, coords_2d)
        load_world_json()  # This will also automatically create world.json if needed
    else:
        all_embeddings = get_all_embedding()
        coords_2d = Calculate_UMAP_cords(all_embeddings)
        upsert_all_memories(memories, all_embeddings, coords_2d)
    
    #only the name
    print(Retrive_top_k.run("His father's name"))
    print()
    print()
    print(len(load_world_json()))
    client.close()
    a = input(">>>")
    if a == "":
        delete_DB_world()
 