import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI
from utils import debug_print

load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")

llm_client = OpenAI(
    base_url="https://api.aicredits.in/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)

FULL_STORY_PATH = Path(__file__).resolve().parent.parent / "data" / "full_story.md"

def load_full_story() -> str:
    """Load the canonical full story from markdown."""
    with open(FULL_STORY_PATH, "r", encoding="utf-8") as f:
        return f.read()


def check_story(user_story: str) -> dict:
    """
    Compare the user's written story against the canonical story using an LLM.

    Returns a dict:
    {
        "score": int (0-100),
        "feedback": str (brief explanation),
        "matched_elements": [str, ...],
        "missed_elements": [str, ...]
    }
    """
    canonical = load_full_story()

    debug_print("story_check.py", "check_story", "Sending comparison to LLM...")

    system_prompt = """You are a story comparison judge for a mystery game.

The player has investigated clues by talking to an AI (ORACLE) and written their own
reconstruction of the story. You must compare the player's story against the official
canonical story and determine how closely they match.

Scoring guidelines:
- 90-100: Perfect or near-perfect. All major plot points, characters, and events correct.
- 70-89: Very good. Most major elements correct, some minor details wrong or missing.
- 50-69: Decent. Some major plot points correct, but significant gaps or errors.
- 25-49: Poor. Only a few elements match the canonical story.
- 0-24: Essentially wrong or completely unrelated.

Focus on plot substance, not writing style or wording. The player does not need to use
the exact same phrasing — what matters is whether they understood the key narrative elements.

Return your response as a JSON object with these fields:
- "score": integer from 0 to 100
- "feedback": a short 1-2 sentence explanation of the score
- "matched_elements": list of specific plot points or details the player got right
- "missed_elements": list of important plot points or details the player missed or got wrong
"""

    user_prompt = f"""--- CANONICAL STORY (the truth) ---
{canonical}

--- PLAYER'S STORY (their reconstruction) ---
{user_story}

Compare the player's story against the canonical story and return a JSON score object."""

    try:
        response = llm_client.chat.completions.create(
            model="openai/gpt-5-nano",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        import json
        result = json.loads(response.choices[0].message.content)

        # Ensure score is an integer 0-100
        score = max(0, min(100, int(result.get("score", 0))))

        debug_print("story_check.py", "check_story", f"Score: {score}")

        return {
            "score": score,
            "feedback": result.get("feedback", ""),
            "matched_elements": result.get("matched_elements", []),
            "missed_elements": result.get("missed_elements", [])
        }

    except Exception as e:
        debug_print("story_check.py", "check_story", f"Error: {e}")
        return {
            "score": 0,
            "feedback": f"Error comparing stories: {str(e)}",
            "matched_elements": [],
            "missed_elements": []
        }