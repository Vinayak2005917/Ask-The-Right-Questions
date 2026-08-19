import os
from fastapi import FastAPI
from pydantic import BaseModel
from agent import ask_agent
from backend.server.rag import client
from story_check import check_story

class StoryCheckRequest(BaseModel):
    story: str

app = FastAPI()

@app.post("/ask")
def ask_route(query: str):
    return ask_agent(query)

@app.post("/check-story")
def check_story_route(req: StoryCheckRequest):
    return check_story(req.story)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    client.close()