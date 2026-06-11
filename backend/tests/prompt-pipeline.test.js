import assert from "node:assert/strict";
import test from "node:test";

import { buildSmartPromptEnhancement } from "../src/services/wavespeedService.js";

function build(userPrompt) {
  return buildSmartPromptEnhancement({
    userPrompt,
    quality: "high",
    style: "realistic",
    type: "image",
  });
}

test("white chicken prompt remains isolated from business fallback content", () => {
  const result = build("دجاجة بيضاء");

  assert.match(result.enhancedPrompt, /دجاجة بيضاء/);
  assert.match(result.finalPrompt, /white chicken/i);
  assert.match(result.finalPrompt, /farm/i);
  assert.doesNotMatch(result.finalPrompt, /Create an image.*:\s*\n\s*\nStrict rules/is);
  assert.match(result.negativePrompt, /meeting room/i);
  assert.match(result.negativePrompt, /office/i);
});

test("cat and dog prompt preserves both requested animals and the garden", () => {
  const result = build("قط أسود بجانب كلب أسود داخل حديقة");

  assert.match(result.finalPrompt, /black cat/i);
  assert.match(result.finalPrompt, /black dog/i);
  assert.match(result.finalPrompt, /garden/i);
  assert.match(result.finalPrompt, /side by side|next to/i);
});

test("two colored robots on the moon preserve count, colors, and relation", () => {
  const result = build("روبوت أخضر بجانب روبوت أصفر على القمر");

  assert.match(result.finalPrompt, /exactly two robots/i);
  assert.match(result.finalPrompt, /green robot/i);
  assert.match(result.finalPrompt, /yellow robot/i);
  assert.match(result.finalPrompt, /moon surface/i);
  assert.match(result.finalPrompt, /side by side/i);
});

test("businessman Ferrari prompt keeps the dog color separate from the car color", () => {
  const result = build("رجل أعمال راكب سيارة فراري ومعه كلب أسود بجانبه");

  assert.match(result.finalPrompt, /businessman/i);
  assert.match(result.finalPrompt, /red Ferrari/i);
  assert.match(result.finalPrompt, /black dog/i);
  assert.match(result.finalPrompt, /sitting inside|riding in/i);
  assert.match(result.finalPrompt, /next to him/i);
});
