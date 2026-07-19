from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
import os
import json
from make_db import *
from utils import debug_print
from pprint import pprint
from dotenv import load_dotenv
load_dotenv()
from pydantic import BaseModel, Field
from typing import Literal

if not os.getenv("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")

OpenAI_GPT5_Nano = ChatOpenAI(
    model="openai/gpt-5-nano",
    base_url="https://api.aicredits.in/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)

current_model = OpenAI_GPT5_Nano
memory = InMemorySaver()


system_prompt = """
you are a detective who is trying to solve a murder mystery, tell the user that you have amnesia and the user has to ask you things to make u remember things.
reply in one line or less.
you 2 jobs:
1. Talk to the user and figure help them
2. When they ask something and it looks like they are asking for evidence, use the retrive_top_k tool.

NEVER RETRIVE MORE THAN 3 MEMORIES

DO NOT USE THE TOOL IF THE USER WANTS TO TALK.


the already known stuff : 
A person known for being magically good at perdicting the future victor mercer went missing on 17th september 2009.
We have to find him. His phone was found by the detectives.
"""

main_agent = create_agent(
    model=current_model,
    tools=[Retrive_top_k],
    system_prompt=system_prompt,
    checkpointer=memory
)
 

def ask_agent(user_input: str):
    debug_print(f"Main agent was invoked with query : {user_input}")
    response = main_agent.invoke({
        "messages": [{"role": "user", "content": user_input}]},
        config={"configurable": {"thread_id": "my_chat"}}
    )
    debug_print("response received, extracting memories...")

    messages = response.get("messages", [])
    contents = ""
    memories = []

    for msg in reversed(messages):
        if hasattr(msg, "type") and msg.type == "ai" and msg.content:
            contents = msg.content
            break

    for msg in messages:
        if hasattr(msg, "type") and msg.type == "tool" and msg.content:
            try:
                tool_data = json.loads(msg.content)
                if isinstance(tool_data, list):
                    for item in tool_data:
                        memories.append({
                            "mem_id": item["id"],
                            "text": item["text"],
                            "x": item["X"],
                            "y": item["Y"],
                        })
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

    debug_print(f"Response: {contents}")
    debug_print(f"Memories returned: {len(memories)}")

    response_data = {
        "type": "response",
        "contents": contents,
        "memories": memories,
    }
    pprint(f"Response data: {response_data}")
    return response_data

if "__main__" == __name__:
    pprint(ask_agent("what was his name?"))
    client.close()