import asyncio
import sys
import os

# Ensure backend directory is in python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import init_db
from app.models.workflow import Skill

async def init_test_skills():
    print("Connecting to MongoDB...")
    await init_db(db_name='agent_db')
    
    print("Clearing existing skills...")
    await Skill.find_all().delete()
    
    print("Inserting test skills...")
    
    search_skill = Skill(
        name='Google Search',
        type='tool',
        description='Search google for current events and information.',
        input_schema={'query': 'string'},
        output_schema={'results': 'array'},
        implementation={
            "executor": "python_eval",
            "config": {
                "code": """
def execute(inputs):
    import requests
    import os

    query = inputs.get("query")
    api_key = os.getenv("SERPAPI_API_KEY")

    if not api_key:
        return {"error": "Missing SERPAPI_API_KEY in environment"}

    url = f"https://serpapi.com/search.json?q={query}&api_key={api_key}"
    response = requests.get(url)
    data = response.json()

    results = []
    for item in data.get("organic_results", []):
        results.append({
            "title": item.get("title"),
            "link": item.get("link")
        })

    return {"results": results[:5]} 
"""
            }
        }
    )
    
    summary_skill = Skill(
        name='AI Summarizer',
        type='llm',
        description='Summarize text input into a concise paragraph.',
        input_schema={'text': 'string'},
        output_schema={'summary': 'string'},
        implementation={
            "prompt_template": "Please summarize the following text concisely:\n\n{{text}}"
        }
    )

    translation_skill = Skill(
        name='English to Chinese',
        type='llm',
        description='Translate English text to Simplified Chinese.',
        input_schema={'text': 'string'},
        output_schema={'translation': 'string'},
        implementation={
            "prompt_template": "Please translate the following text to Simplified Chinese:\n\n{{text}}"
        }
    )
    
    await search_skill.insert()
    await summary_skill.insert()
    await translation_skill.insert()
    
    print(f"Successfully inserted {await Skill.count()} test skills into agent_db!")

if __name__ == "__main__":
    asyncio.run(init_test_skills())
