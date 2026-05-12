import asyncio
from classifier import classify

async def main():
    result = await classify("The projector is broken")
    print("Result:", result)

asyncio.run(main())
