from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/anonymize")
async def anonymize():
    # Stub — core logic in src/anonymizer_prawniczy/ (scaffold per AGENTS.md)
    return {"status": "anonymized", "backend": "anonimizator"}
