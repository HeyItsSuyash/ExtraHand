# Extra Hand

Extra Hand is an open-source, intelligent browser automation agent designed to make web automation fast, easy, and resilient. 

By combining traditional macro recording with AI-driven DOM parsing, Extra Hand allows you to automate repetitive tasks reliably, even when website structures change.

## Features
- **Record Macros:** Click record and perform your task once. Extra Hand watches your DOM interactions and converts them into repeatable scripts.
- **Let AI Drive:** For complex or dynamic websites, provide a natural language prompt. Extra Hand will parse the DOM and use LLMs to find the right elements to interact with.
- **Secure & Local:** Your API keys are synced securely to the extension, and the heavy lifting is done right in your browser.

## How to Install (Developer Mode)

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** by toggling the switch in the top right corner.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder containing the Extra Hand extension files (the root folder of this repository).
6. The Extra Hand icon will now appear in your Chrome toolbar. Pin it for easy access!

## Getting Started

1. **Sign In:** Click on the Extra Hand extension icon to open the side panel. You'll be prompted to sign in via the dashboard.
2. **Add API Keys:** Once signed in, head over to the settings/dashboard to securely add your API keys (we highly recommend **OpenRouter** for cost-effective, fast DOM parsing using models like Llama-3).
3. **Automate:** 
   - Click the **Record** button in the side panel to start recording a macro.
   - Or, type a natural language command in the chat box (e.g., "Extract the top 5 posts from this page") and let the AI agent take over.

## Security & Privacy
Extra Hand operates locally in your browser. Your API keys are stored securely and never sent to third-party servers other than the providers you explicitly use (e.g., OpenAI, Anthropic, OpenRouter).

## Contributing
Extra Hand is fully open-source. Contributions, issues, and feature requests are welcome! Feel free to fork the repository and submit a pull request.
