import express from 'express';
import http from 'http';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_, res) => res.json({ ok: true }));

const server = http.createServer(app);

server.listen(PORT, () => console.log(`Server on ${PORT}`));
