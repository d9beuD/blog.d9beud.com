import { getSingletonHighlighter } from 'shiki';
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationErrorLevel,
  transformerRemoveLineBreak,
} from '@shikijs/transformers';
import fs from 'fs';

(async () => {
  const lang = process.argv[2] || 'plaintext';
  const filePath = process.argv[3];
  
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const highlighter = await getSingletonHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: ['php', 'yml', 'shell', 'ts', 'vue']
    });
    const highlightedCode = highlighter.codeToHtml(code.trimEnd(), {
      lang,
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        transformerNotationErrorLevel(),
        transformerRemoveLineBreak()
      ]
    });
    console.log(highlightedCode.trimEnd());
  } catch (error) {
    console.error("Error highlighting code:", error);
    process.exit(1);
  }
})();