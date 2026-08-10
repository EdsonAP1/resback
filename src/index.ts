import "dotenv/config";
import { createApp } from "./app.js";

const app = createApp();

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`RestoStock API escuchando en http://localhost:${PORT}`);
});
