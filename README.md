# Queen.js
Queen.js is a lightweight web framework inspired by Express.js, designed for Node.js applications. Please note that Queen.js is primarily an educational project and is not intended for production use. It was created from scratch with the aim of understanding the internal workings of Express.js.

## Features
- **Route Handling**: Define routes using HTTP methods like GET, POST, PUT, PATCH, and DELETE.
- **Dynamic Route Parameters**: You can define routes with parameters using the syntax :parameterName, and these parameters can be accessed in route handlers via `req.params.parameterName`.
- **Plugin (middleware) Support**: Easily integrate middleware functions, called plugins in Queen, to execute tasks before handling requests.
- **Request and Response Handling**: Access request and response objects with extended functionalities.
- **JSON and Multipart Handling**: Built-in support for parsing JSON requests and handling multipart/form-data requests.

## Example
```typescript
import http from "node:http";
import { Queen } from "queen-js";

const queen = new Queen();

// register plugins
queen.register(Queen.json());
queen.register(Queen.multipart("custom-storage"));

// request logger plugin
queen.register((req, res, next) => {
  console.log(`${req.method}, ${req.url}: ${new Date()}`);
  next();
});

// define routes
queen.get("/", async (req, res) => {
  await res.sendFile("public/index.html");
});

// dynamic routing
queen.get("/users/:id", async (req, res) => {
  await res.send(`Hello user ${req.params.id}`);
});

// doesn't clash with the above dynamic route
queen.get("/users/profile", async (req, res) => {
  await res.send(`user's profile page`);
});

// this route will receive multipart/form-data from front-end & handle file upload (see /public/index.html)
queen.post("/upload", async (req, res) => {
  await res.json({
    message: "ok",
    data: req.body || {},
  });
});

// this route will receive json body from front-end (see /public/index.html)
queen.post("/json", async (req, res) => {
  await res.json({
    message: "ok",
    data: req.body || {},
  });
});

// create server
const server = http.createServer(queen.handler());

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}...`));
```

## Example Usage

To run the example provided in this repository:

1. Clone the repository:

    ```
    git clone https://github.com/yourusername/queen-js.git
    ```

2. Navigate to the project directory:

    ```
    cd queen-js
    ```

3. Start the server:

    ```
    npm run dev
    ```

4. Open your web browser and navigate to [http://localhost:3000](http://localhost:3000) to access the example.

The server will serve the `public/index.html` file on the root route (`GET /`). The `index.html` file contains two forms for testing various endpoints provided by Queen.js:
- One form is for uploading files.
- The other form is for submitting JSON data.


Feel free to explore the code in `index.ts` to understand how Queen.js works and customize it according to