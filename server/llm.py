from config import GEMINI_API_KEY, GEMINI_MODEL, MAX_CONTEXT
from prompts import SYSTEM_PROMPTS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import ChatPromptTemplate
from langchain.schema.output_parser import StrOutputParser

def init_llm():
    if not GEMINI_API_KEY:
        print("⚠️  GEMINI_API_KEY not set — LLM calls will fail")
    llm = ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        google_api_key=GEMINI_API_KEY,
        temperature=0.1,
        convert_system_message_to_human=True,
    )
    print(f"✅ LLM ready  (model={GEMINI_MODEL})")
    return llm

# async def generate_command(llm, query: str, shell: str, history: list = []) -> str:
#     system   = SYSTEM_PROMPTS.get(shell.lower(), SYSTEM_PROMPTS["bash"])
#     messages = [("system", system)]

#     for pair in history[-MAX_CONTEXT:]:
#         messages.append(("human",     pair.get("query",   "")))
#         messages.append(("assistant", pair.get("command", "")))

#     messages.append(("human", query))

#     prompt = ChatPromptTemplate.from_messages(messages)
#     chain  = prompt | llm | StrOutputParser()
#     result = await chain.ainvoke({})
#     result = result.strip().strip("`").strip()
#     for fence in ["```powershell", "```bash", "```cmd", "```shell", "```"]:
#         result = result.replace(fence, "")
#     return result.strip()


async def generate_command(llm, query: str, shell: str,
                           history: list = [], retrieved: list = []) -> tuple:
    system   = SYSTEM_PROMPTS.get(shell.lower(), SYSTEM_PROMPTS["bash"])
    messages = [("system", system)]

    rag_used = False
    if retrieved:
        rag_used = True
        rag_block = "Here are similar commands from history for reference:\n"
        for item in retrieved:
            rag_block += f"- '{item['query']}' → {item['command']}\n"
        rag_block += "\nUse these as reference to generate the best command for the current request."
        messages.append(("human", rag_block))
        messages.append(("assistant", "Understood. I will use these as reference."))

    for pair in history[-MAX_CONTEXT:]:
        messages.append(("human",     pair.get("query",   "")))
        messages.append(("assistant", pair.get("command", "")))

    messages.append(("human", query))

    prompt = ChatPromptTemplate.from_messages(messages)
    chain  = prompt | llm | StrOutputParser()
    result = await chain.ainvoke({})
    result = result.strip().strip("`").strip()
    for fence in ["```powershell", "```bash", "```cmd", "```shell", "```"]:
        result = result.replace(fence, "")
    return result.strip(), rag_used

async def explain_command(llm, command: str) -> str:
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a shell command explainer. Given a shell command, explain in ONE plain English sentence what it does. No technical jargon. Be concise."),
        ("human",  "Command: {command}"),
    ])
    chain  = prompt | llm | StrOutputParser()
    result = await chain.ainvoke({"command": command})
    return result.strip()