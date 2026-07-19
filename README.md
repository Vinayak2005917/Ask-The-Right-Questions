<h1 align="center">
  <img src="frontend\src\assets\new.png"height="40" style="vertical-align: middle;">
Ask The Right Questions
</h1>

>**Under Active development**

A pixel-art detective game where players learn how RAG Agents works by questioning an AI with amnesia to solve a case of a missing person.

<p align="center">
  <img src="Full Map.png" alt="Description" width="350">
</p>


Retrival Augmented Generation (RAG) does a good job at sounding very complex. A lot of people struggle with visulizing the Vector Space of Vector Databases and how the RAG Agent uses it to answer questions. This game is designed to help people understand how RAG Agents work by providing an interactive situation where **YOU** The **Detective** have to solve the mystery of a missing person by asking the right questions to an AI with amnesia, It will retrive the ```Top K relevant``` most similar memories from the vector database made using ```Qdrant``` and ```langchain```.

### Victory Condition
The user has to enter the best guess they have of the overall story. If the guess is good enough the user wins, else the try again.

## Architecture 

<p align="center">
  <img src="diagram.png" alt="Description" width="350">
</p>

the Full_st

The backend is built using ```FastAPI``` and ```Langchain``` to handle the RAG Agent. The frontend is built using ```PixiJS``` to provide a pixel-art experience. The backend is hosted on ```Render``` and the frontend is hosted on ```Vercel```.