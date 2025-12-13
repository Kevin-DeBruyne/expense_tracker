import { Config } from '../Config';

export interface GeminiExpense {
    merchant: string;
    amount: number;
    type: 'debit' | 'credit';
    category: string;
    confidence: number;
}

const SYSTEM_PROMPT = `
You are an intelligent expense tracker assistant. 
Your goal is to extract structured data from SMS transaction messages.

Input: An SMS text.
Output: A JSON object with these fields:
- "merchant": The name of the merchant or person (e.g., "Starbucks", "Uber", "Ramesh"). Clean it up (remove "VPA", "UPI", etc.).
- "amount": The transaction amount (number).
- "type": "debit" or "credit".
- "category": A short category (e.g., "Food", "Travel", "Shopping", "Bills").
- "confidence": A number between 0 and 1 indicating how sure you are.

If the message is NOT a transaction, return content: null.
Return ONLY raw JSON.
`;

export const analyzeSmsWithGemini = async (text: string): Promise<GeminiExpense | null> => {
    if (!Config.GEMINI_API_KEY || Config.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        console.warn('Gemini API Key missing');
        return null;
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${Config.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: SYSTEM_PROMPT + `\n\nSMS: "${text}"` }]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                }),
            }
        );

        const data = await response.json();

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            const jsonText = data.candidates[0].content.parts[0].text;
            const result = JSON.parse(jsonText);

            // Basic validation
            if (result && result.amount && result.type) {
                return result as GeminiExpense;
            }
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
    }

    return null;
};
