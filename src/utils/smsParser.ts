
export interface ParsedExpense {
    title: string;
    amount?: number;
    source?: string;
}

export const parseSmsBody = (body: string, sender: string): ParsedExpense => {
    const text = body;
    let title = '';
    let amount = 0;

    // 1. Extract Amount
    const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d{1,2})?)/i);
    if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    // 2. Extract Merchant Name (Regex Strategies)
    // Strategy A: "paid to X", "spent at X"
    const merchantRegex = /(?:paid to|spent at|sent to|transfer to|purchase at|payment to)\s+([A-Za-z0-9\s&*-]+?)(?:\s+(?:on|using|via|ref|txn|from|ending)|$)/i;
    const matchA = text.match(merchantRegex);

    // Strategy B: "VPA X" (UPI)
    const upiRegex = /(?:VPA|UPI Ref|UPI-Ref|to VPA)\s+([A-Za-z0-9@.-]+)/i;
    const matchB = text.match(upiRegex);

    if (matchA && matchA[1]) {
        title = matchA[1].trim();
    } else if (matchB && matchB[1]) {
        // Clean up UPI ID to just get the name if possible, or use the ID
        title = matchB[1].split('@')[0].replace(/[._]/g, ' '); // simple heuristic
    }

    // 3. Keyword Mapping (Fallback Category)
    if (!title) {
        const keywords: Record<string, string> = {
            'swiggy': 'Swiggy',
            'zomato': 'Zomato',
            'uber': 'Uber',
            'ola': 'Ola',
            'rapido': 'Rapido',
            'amazon': 'Amazon',
            'flipkart': 'Flipkart',
            'netflix': 'Netflix',
            'spotify': 'Spotify',
            'jio': 'Jio Recharge',
            'airtel': 'Airtel Recharge',
            'vi': 'Vi Recharge',
            'bsnl': 'BSNL Recharge',
            'metro': 'Metro',
            'starbucks': 'Starbucks',
            'mcdonalds': 'McDonalds',
            'dominos': 'Dominos',
            'pizza hut': 'Pizza Hut',
            'burger king': 'Burger King',
            'kfc': 'KFC',
            'subway': 'Subway',
        };

        const lowerText = text.toLowerCase();
        for (const [key, value] of Object.entries(keywords)) {
            if (lowerText.includes(key)) {
                title = value;
                break;
            }
        }
    }

    // 4. Ultimate Fallback
    if (!title) {
        // Use sender if available, else generic
        const cleanSender = sender.replace(/[0-9-]/g, ''); // Remove regex garbage from sender if any
        title = cleanSender || "Expense";

        // Attempt cleanup if it still looks too generic or contains "AD-" etc
        if (title.length < 3 || title.includes("BANK")) {
            title = "Bank Transaction";
        }
    }

    // Capitalize Title
    title = title.replace(/\b\w/g, l => l.toUpperCase());

    return { title, amount };
};
