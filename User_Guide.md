# SecureChat

## SecureChat is a real-time messaging application designed for teams to talk remotely like Slack or Teams. It allows users to message each other over encrypted connections.

### Required dependencies
- [Node.js](https://nodejs.org/en) (only tested on version 25.1.0)
- npm (bundled with Node.js)
- A modern web browser (Chrome, Firefox,)
- OpenSSL (only tested on version 3.4.0 )
  
## How to run the Applicaton

1. #### Clone the repository
    ```git clone https://github.com/kosoknarith/securechat-group5.git```
    ```cd securechat-group5```

2. #### Install the dependencies
    ```npm install```   


3. #### Running the Server
    ##### Go to the server directory:
    ```cd server```
    ##### Generate Certification and Key
    ```npm run make-cert```
    ##### Start the Server:
    ```node src/index.js```
    ##### You should see:
    ```WebSocket server running on wss://localhost:8080```

5. #### Running the Client
   ##### Open:
   ```https://localhost:8080/login.html```

6. #### Logging In
   1. Go to the login page
   2. Entere a valid username and password
   3. Click Sign In
   
7. #### Start Chatting
   1. Click on the chat box
   2. Type a message
   3. Click Send or Press <kbd>Enter</kbd>