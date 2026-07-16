SiYuan Notes AI Assistant Plugin, which enables rich functionalities such as Q&A and editing based on the content of SiYuan Notes.

**Note**: Using this plugin requires you to prepare your own API keys from AI platforms. The plugin itself does not provide AI services. Please comply with the terms of use and privacy policies of each platform.

> For friends who need to use top-tier models like GPT-5, Gemini 2.5 Pro, Claude 4.5, etc.
> - Recommended [V3 API Website](https://api.gpt.ge/register?aff=fQIZ). It's very easy to use, pay-as-you-go, supports various AI models, and can save you a lot of money compared to using the official API. Register using my [invitation link](https://api.gpt.ge/register?aff=fQIZ) to get a $0.3 balance bonus for trial.

## 📝 Changelog

See [CHANGELOG.md](https://cdn.jsdelivr.net/gh/Achuan-2/SiYuan-plugin-copilot@main/CHANGELOG.md)

## ✨ Main Features

- Multi-platform AI Support:
  - Built-in support for common platforms (OpenAI, Google Gemini, DeepSeek, Volcano Engine)
  - Also supports adding any platform compatible with the OpenAI API, allowing flexible switching of chat models
- Model Settings
  - Supports independent configuration of parameters for each model (temperature, max tokens)
  - Identifies special model capabilities (thinking mode, vision support)
- Three Chat Mode Switching: Switch between ask, edit, and agent chat modes
  - Ask Mode: For daily Q&A, supports selecting multiple models to reply simultaneously and choosing satisfactory answers
  - Edit Mode: For editing and modifying notes, supports viewing differences after editing and undo functionality
  - Agent Mode: Provides tools for the AI to autonomously query note content, edit notes, create documents, etc.
- Conversation Management
  - Supports saving conversation history, pinning and deleting historical records
  - Supports copying conversations as Markdown
  - Supports saving conversations as documents
- Multimodal Support
  - SiYuan Notes Content: Upload note content by dragging blocks, dragging page tabs, or dragging documents from the document tree
  - Image Upload: Supports pasting, uploading images, and also supports dragging image blocks directly for upload
  - File Upload (Supports Markdown, text files, etc.)
- Prompt Management
  - Supports creating and saving commonly used prompts for quick insertion into the input box

## 🔧 Development Related

### Local Development

```bash
pnpm install
pnpm run dev
```

### Files
- `src\tools\index.ts`: Implementation code for tools called in agent mode

## 📄 License

GPL3 License

## 🙏 Acknowledgments

- Developed based on the [plugin-sample-vite-svelte](https://github.com/SiYuan-note/plugin-sample-vite-svelte/) template
- Referenced the GPT conversation functionality implementation from [sy-f-misc](https://github.com/frostime/sy-f-misc)

## 📮 Feedback and Suggestions

If you have any issues or suggestions, please feel free to raise them in [GitHub Issues](https://github.com/Achuan-2/SiYuan-plugin-ai-sidebar/issues).