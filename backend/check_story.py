import json
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    base_url="https://api.aicredits.in/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)


def check_story(contents: str, progress_check_id: int) -> dict:

    with open("./data/full_story.md", "r", encoding="utf-8") as f:
        true_story = f.read()

    prompt = f"""You are evaluating a player's reconstructed story against the true story.

True story:
{true_story}

Player's notes:
{contents}

Score the player's reconstruction from 0 to 100 based on how well it matches the true story events, characters, and key details. A score of 70 or higher means victory — the player has essentially solved the mystery.

Respond ONLY with a JSON object: {{"progress_check_status": <int>}}
"""

    response = client.chat.completions.create(
        model="openai/gpt-5-nano",
        messages=[{"role": "user", "content": prompt}],
    )

    result = json.loads(response.choices[0].message.content)

    return {
        "type": "progress_check_response",
        "progress_check_id": progress_check_id,
        "progress_check_status": result.get("progress_check_status", 0),
    }