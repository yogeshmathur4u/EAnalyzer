import { answerQuestion, generateThreadStory } from '../services/aiService.js';

export async function askQuestion(req, res) {
  const { question, threadId } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question must be a non-empty string' });
  }

  try {
    const result = await answerQuestion(req.user.id, question.trim(), { threadId });
    res.status(200).json(result);
  } catch (err) {
    console.error('AI question answering failed:', err);
    res.status(500).json({ error: 'Failed to answer question' });
  }
}

export async function generateStory(req, res) {
  try {
    const result = await generateThreadStory(req.user.id, req.params.threadId);
    res.status(200).json(result);
  } catch (err) {
    console.error('Thread story generation failed:', err);
    res.status(500).json({ error: 'Failed to generate thread story' });
  }
}
