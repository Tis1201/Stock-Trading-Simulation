from pydantic import BaseModel

class MQMessage(BaseModel):
    text: str
