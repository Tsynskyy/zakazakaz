import express from 'express';

const app = express();
const port = 3220;

app.get('/health', (_req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.get('/', (_req, res) => {
	res.sendStatus(200);
});

app.listen(port, '0.0.0.0', () => {
	console.log(`Server started on port ${port}`);
});

