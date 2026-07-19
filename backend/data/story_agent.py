from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver
from langchain.tools import tool
import os
from dotenv import load_dotenv
load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")

DeepSeek_V4_Flash = ChatOpenAI(
    model="deepseek/deepseek-v4-flash",
    base_url="https://api.aicredits.in/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)

from datetime import datetime
import inspect
import os

def debug_print(contents):
    # Get the caller's frame
    frame = inspect.currentframe().f_back
    
    # Get file name (just the base name, not full path)
    file_name = os.path.basename(frame.f_globals.get("__file__", "unknown"))
    
    # Get function name
    function_name = frame.f_code.co_name
    
    now = datetime.now()
    date_time_info = now.strftime("%H:%M:%S.%f")[:-3]
    print(f"\n[{date_time_info}] [{file_name}] [{function_name}] DEBUG: {contents}")

memory = InMemorySaver()

system_prompt = """
You are an agent use to help the user write a single story in two formats, make sure the two files are telling the same story. You are suppose to ask the user questions to understand the story and form it in a cohesive manner.
The questions asked should be only one or two lines and you are to write to the files every few questions, not one big dump. If the user's is not sure about a details give them some recommandations to choose from.
Do not ask the user questions longer than one line. If there is any confusion, ask the user. Ask the user whenever needed, as much as reasonably needed.

#Two formats of the story are:
1. memories.json : This file is used to store the story in a structured and also detective report manner.
2. full_story.md : This file is used to store the story in a narrative manner.

both the files already have some of story written so you can read those files first to understand the story and then ask the user questions to fill in the gaps. 

#Tools
1. ask_user : This tool is used to ask the user questions.
2. read_memories : This tool is used to read the contents of memories.json file.
3. read_story : This tool is used to read the contents of full_story.md file.
4. write_to_memories : This tool is used to append content to the memories.json file.
5. write_to_full_story : This tool is used to append content to the full_story.md file.

#Use Case
These two files are gonna be used for a mystery game. where the memories.json file is all the evidence and research and all the detectives have done before and figureed out, they are meant to be written in a fact first manner and should not contain something that can't be known.
The 2nd file full_story.md is meant be to the source of truth and should be written in a narrative manner, it can contain things that can't be known and can be written in a more story like manner. 

"""

#tools to read and write to files : memories.json and full_story.md
@tool("Read_memories",description="Read the contents of memories.json file")
def read_memories() -> str:
    file_path = "C:\\Users\\vk200\\OneDrive\\Desktop\\ATRQ_Project\\backend\\data\\memories.json"
    file_name = "memories.json"
    debug_print(f"Reading file {file_path}")
    if not os.path.exists(file_path):
        debug_print(f"File {file_path} does not exist.")
        return "File does not exist."
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()
    
@tool("Read_story",description="Read the contents of full_story.md file")
def read_story() -> str:
    file_path = "C:\\Users\\vk200\\OneDrive\\Desktop\\ATRQ_Project\\backend\\data\\full_story.md"
    file_name = "full_story.md"
    debug_print(f"Reading file {file_path}")
    if not os.path.exists(file_path):
        debug_print(f"File {file_path} does not exist.")
        return "File does not exist."
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()
    
@tool("write_to_memories", description="rewrite content to the memories file.")
def write_to_memories(content: str) -> str:
    file_path = "C:\\Users\\vk200\\OneDrive\\Desktop\\ATRQ_Project\\backend\\data\\memories.json"
    file_name = "memories.json"
    if not os.path.exists(file_path):
        return "File does not exist."
    debug_print(f"Rewriting {file_path}")
    confirm = input(f"Allow Triton to modify '{file_name}'? (Y/N): ").strip().lower()
    if confirm not in ("", "y", "Y"):
        return "File update denied by the user."
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        debug_print(f"Rewritten content to {file_path}")
        return f"Updated '{file_name}'."
    except Exception as e:
        debug_print(f"Error rewriting file {file_path}: {e}")
        return str(e)

@tool("write_to_full_story", description="rewrite content to the full story file.")
def write_to_full_story(content: str) -> str:
    file_path = "C:\\Users\\vk200\\OneDrive\\Desktop\\ATRQ_Project\\backend\\data\\full_story.md"
    file_name = "full_story.md"
    if not os.path.exists(file_path):
        return "File does not exist."
    debug_print(f"Rewriting {file_path}")
    confirm = input(f"Allow Triton to modify '{file_name}'? (Y/N): ").strip().lower()
    if confirm not in ("", "y", "Y"):
        return "File update denied by the user."
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        debug_print(f"Rewritten content to {file_path}")
        return f"Updated '{file_name}'."
    except Exception as e:
        debug_print(f"Error rewriting file {file_path}: {e}")
        return str(e)

@tool("ask_user", description="Ask the user for input.")
def ask_user(question: str) -> str:
    print()
    print(f"Agent is asking the user: {question}")
    return input(">>> ")

main_agent = create_agent(
    model=DeepSeek_V4_Flash,
    tools=[read_memories, read_story, write_to_memories, write_to_full_story, ask_user],
    system_prompt=system_prompt,
    checkpointer=memory
)
 

def ask_agent(user_input: str):
    debug_print(f"Main agent was invoked with query: {user_input}")
    response = main_agent.invoke({
        "messages": [{"role": "user", "content": user_input}]},
        config={"configurable": {"thread_id": "my_chat"}}
    )

while True:
    user_input = input("You: ")
    if user_input.lower() in ["exit", "quit"]:
        print("Exiting the agent.")
        break
    ask_agent(user_input)

