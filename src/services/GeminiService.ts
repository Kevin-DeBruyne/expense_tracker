import { Config } from '../Config';
import { Alert } from 'react-native';

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

Rules:
- "Sent Rs..." or "Transfer to..." means TYPE = "debit".
- "Sent to [Name]" means MERCHANT = [Name].
- If the message is NOT a transaction, return content: null.
- Return ONLY raw JSON.
`;

export const analyzeSmsWithGemini = async (text: string): Promise<GeminiExpense | null> => {
    console.log('Gemini Service: Analyzing SMS:', text);

    if (!Config.GEMINI_API_KEY || Config.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        const msg = 'Gemini Service: API Key missing or default';
        console.warn(msg);
        Alert.alert('Gemini Error', msg);
        return null;
    }

    try {
        console.log('Gemini Service: Sending request to API...');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${Config.GEMINI_API_KEY}`,
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

        console.log('Gemini Service: API Response Status:', response.status);
        const responseText = await response.text();
        console.log('Gemini Service: Raw Response Body:', responseText);

        if (response.status === 429) {
            console.error("Gemini Service: Rate Limit Exceeded");
            throw new Error("RATE_LIMIT_EXCEEDED");
        }

        if (!response.ok) {
            const errorMsg = `Gemini Service: API Error Response: ${responseText}`;
            console.error(errorMsg);
            Alert.alert('Gemini API Error', `Status: ${response.status}\nBody: ${responseText.substring(0, 500)}`);
            return null;
        }

        const data = JSON.parse(responseText);

        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            const jsonText = data.candidates[0].content.parts[0].text;
            console.log('Gemini Service: Parsed JSON content:', jsonText);

            try {
                const result = JSON.parse(jsonText);

                // Basic validation
                if (result && result.amount && result.type) {
                    console.log('Gemini Service: Successfully extracted expense:', result);
                    Alert.alert('Gemini Success', `Extracted: ${JSON.stringify(result)}`);
                    return result as GeminiExpense;
                } else {
                    const warnMsg = `Gemini Service: Result missing required fields (amount or type): ${JSON.stringify(result)}`;
                    console.warn(warnMsg);
                    Alert.alert('Gemini Validation Error', warnMsg);
                }
            } catch (parseError) {
                const parseErrorMsg = `Gemini Service: Error parsing inner JSON from model: ${parseError}`;
                console.error(parseErrorMsg);
                Alert.alert('Gemini Parse Error', `JSON Parse failed: ${parseError}\nText: ${jsonText}`);
            }
        } else {
            const noCandMsg = 'Gemini Service: No valid candidates in response';
            console.warn(noCandMsg);
            Alert.alert('Gemini Empty Response', noCandMsg);
        }
    } catch (error) {
        const netErrorMsg = `Gemini Service: Network or Logic Error: ${error}`;
        console.error(netErrorMsg);
        Alert.alert('Gemini Network Error', `${error}`);
    }

    return null;
};
