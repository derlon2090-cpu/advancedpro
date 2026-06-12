import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmartPromptEnhancement,
  buildSmartPromptEnhancementAsync,
} from "../src/services/wavespeedService.js";

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

test("common robot misspelling in space never falls back to a businessman scene", () => {
  build("رجل أعمال داخل مكتب حديث");
  const result = build("اعمل لي صورة ربوت على الفضاء");

  assert.match(result.finalPrompt, /robot/i);
  assert.match(result.finalPrompt, /outer space/i);
  assert.match(result.finalPrompt, /stars|planets/i);
  assert.doesNotMatch(result.finalPrompt, /A clean realistic image based/i);
  assert.match(result.negativePrompt, /businessman/i);
  assert.match(result.negativePrompt, /meeting room/i);
  assert.match(result.negativePrompt, /office/i);
});

test("unknown Arabic prompt is blocked instead of leaking raw Arabic to the provider", () => {
  assert.throws(
    () => build("\u0645\u0634\u0647\u062f \u062e\u064a\u0627\u0644\u064a \u063a\u064a\u0631 \u0645\u0623\u0644\u0648\u0641"),
    (error) => error?.statusCode === 422 && /رصيد/.test(error.message)
  );
});

test("large turtle prompt cannot become a rose or business portrait", () => {
  build("رجل أعمال في غرفة اجتماعات");
  const result = build("سلحفاة كبيرة الحجم");

  assert.match(result.finalPrompt, /large.*turtle|turtle.*large/i);
  assert.match(result.finalPrompt, /turtle shell/i);
  assert.match(result.negativePrompt, /business meeting|meeting room/i);
  assert.match(result.negativePrompt, /rose/i);
  assert.doesNotMatch(result.finalPrompt, /businessman wearing|modern office/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
});

test("mother turtle with babies on the beach preserves the whole family and location", () => {
  const result = build("سلحفاة مع عيالها في الشاطئ");

  assert.match(result.finalPrompt, /adult.*turtle/i);
  assert.match(result.finalPrompt, /baby turtles/i);
  assert.match(result.finalPrompt, /sandy beach/i);
  assert.match(result.finalPrompt, /shoreline|sea/i);
  assert.match(result.finalPrompt, /every baby turtle|all.*visible/i);
  assert.match(result.negativePrompt, /business team|conference room/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
});

test("large wolf with its young always produces wolf pups without business subjects", () => {
  build("\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644 \u062f\u0627\u062e\u0644 \u0645\u0643\u062a\u0628");
  const result = build("\u0630\u0626\u0628 \u0643\u0628\u064a\u0631 \u0645\u0639 \u0635\u063a\u0627\u0631\u0647");

  assert.match(result.finalPrompt, /large adult wolf/i);
  assert.match(result.finalPrompt, /wolf pups/i);
  assert.match(result.finalPrompt, /not human children/i);
  assert.match(result.finalPrompt, /forest wilderness/i);
  assert.match(result.negativePrompt, /businessmen/i);
  assert.match(result.negativePrompt, /food/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
  assert.doesNotMatch(result.finalPrompt, /business portrait|modern office/i);
});

test("very large misspelled Arabic car prompt enforces massive scale and no brand", () => {
  const result = build("\u0635\u064a\u0627\u0631\u0629 \u0643\u0628\u064a\u0631\u0629 \u062c\u062f\u0627");

  assert.match(result.finalPrompt, /extremely large|oversized|massive/i);
  assert.match(result.finalPrompt, /visual scale cues/i);
  assert.match(result.finalPrompt, /full vehicle/i);
  assert.match(result.finalPrompt, /generic original vehicle design/i);
  assert.match(result.negativePrompt, /BMW/i);
  assert.match(result.negativePrompt, /small car/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
});

test("huge black snake with its young produces snakes only and never business people", () => {
  build("\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644 \u0641\u064a \u0645\u0643\u062a\u0628 \u0645\u0639 \u0637\u0639\u0627\u0645");
  const result = build("\u062b\u0639\u0628\u0627\u0646 \u0627\u0633\u0648\u062f \u0643\u0628\u064a\u0631 \u062c\u062f\u0627 \u0645\u0639 \u0635\u063a\u0627\u0631\u0647");

  assert.match(result.finalPrompt, /extremely large, massive adult black snake/i);
  assert.match(result.finalPrompt, /multiple baby snakes/i);
  assert.match(result.finalPrompt, /not human children/i);
  assert.match(result.finalPrompt, /same species/i);
  assert.match(result.finalPrompt, /size contrast/i);
  assert.match(result.negativePrompt, /businessmen/i);
  assert.match(result.negativePrompt, /food/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
  assert.doesNotMatch(result.finalPrompt, /business portrait|modern office/i);
});

test("unknown Arabic vocabulary uses semantic server translation instead of being rejected", async () => {
  const result = await buildSmartPromptEnhancementAsync(
    {
      userPrompt: "شلال ضخم يهبط من جبل جليدي وقت الشروق",
      quality: "high",
      style: "cinematic",
      type: "image",
    },
    {
      translatePrompt: async () =>
        "A massive waterfall descending from an icy mountain at sunrise, with the waterfall, mountain, ice, and sunrise all clearly visible.",
    }
  );

  assert.match(result.finalPrompt, /massive waterfall/i);
  assert.match(result.finalPrompt, /icy mountain/i);
  assert.match(result.finalPrompt, /sunrise/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
  assert.equal(result.debug.translationMode, "server-semantic");
});

test("semantic translation preserves arbitrary Arabic subjects, actions, and relations", async () => {
  const result = await buildSmartPromptEnhancementAsync(
    {
      userPrompt: "طائر أزرق يحمل غصن زيتون ويطير خلف قلعة قديمة",
      quality: "ultra",
      style: "realistic",
      type: "image",
    },
    {
      translatePrompt: async () =>
        "A blue bird carrying an olive branch while flying behind an ancient castle. The bird, olive branch, and castle must all be visible.",
    }
  );

  assert.match(result.finalPrompt, /blue bird/i);
  assert.match(result.finalPrompt, /olive branch/i);
  assert.match(result.finalPrompt, /ancient castle/i);
  assert.doesNotMatch(result.finalPrompt, /Create an image.*businessman.*office/is);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
});
