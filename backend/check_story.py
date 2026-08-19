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

        The player has investigated clues and written their own
        reconstruction of the story. You must compare the player's story against the official
        canonical story and determine how closely they match.

        Scoring guidelines:
        - 90-100: Perfect or near-perfect. All major plot points, characters, and events correct.
        - 70-89: Very good. Most major elements correct, some minor details wrong or missing.
        - 50-69: Decent. Some major plot points correct, but significant gaps or errors.
        - 25-49: Poor. Only a few elements match the canonical story.
        - 0-24: Essentially wrong or completely unrelated.

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