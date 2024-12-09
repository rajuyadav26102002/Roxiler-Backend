const app = require("./app");
const { connectDB } = require("./user");

const startServer = async () => {
  try {
    await connectDB();
    const PORT = 3000;
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start the server:", err);
    process.exit(1);
  }
};

startServer();