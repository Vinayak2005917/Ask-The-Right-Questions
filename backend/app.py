import os
from fastapi import FastAPI
from pydantic import BaseModel
from agent import ask_agent
from make_db import *
from check_story import check_story

app = FastAPI()


class ProgressCheckRequest(BaseModel):
    type: str
    progress_check_id: int
    contents: str


@app.post("/ask")
def ask_route(query: str):
    return ask_agent(query)

@app.post("/send-all")
def send_all():
    return load_world_json()


@app.post("/check-story")
def check_story_route(req: ProgressCheckRequest):
    return check_story(req.contents, req.progress_check_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
    client.close()