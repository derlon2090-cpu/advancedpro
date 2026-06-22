import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmartPromptEnhancement,
  buildSmartPromptEnhancementAsync,
  parseImageValidationPayload,
} from "../src/services/wavespeedService.js";
import {
  analyzePromptComplexity,
  isComplexGenerationPrompt,
} from "../src/utils/promptComplexity.js";
import { assertAllowedGenerationContent } from "../src/utils/credits.js";

function build(userPrompt) {
  return buildSmartPromptEnhancement({
    userPrompt,
    quality: "high",
    style: "realistic",
    type: "image",
  });
}

test("generation UI uses one submit path and keeps background jobs inside the dashboard", async () => {
  const { readFile } = await import("node:fs/promises");
  const dashboardHtml = await readFile(new URL("../../dashboard.html", import.meta.url), "utf8");
  const dashboardScript = await readFile(new URL("../../dashboard-page.js", import.meta.url), "utf8");
  const resultScript = await readFile(new URL("../../generation-page.js", import.meta.url), "utf8");

  assert.match(dashboardHtml, /<button type="submit" data-submit-button>/);
  assert.match(dashboardScript, /\[data-create-form\]"\)\.addEventListener\("submit", handleGenerate\)/);
  assert.doesNotMatch(
    dashboardScript,
    /\[data-submit-button\]"\)\?\.addEventListener\("click", handleGenerate\)/
  );
  assert.match(
    dashboardScript,
    /closest\("a\[data-dashboard-view\], button\[data-dashboard-view\]"\)/
  );
  assert.doesNotMatch(
    dashboardScript,
    /event\.target\.closest\("\[data-dashboard-view\]"\)/
  );
  assert.doesNotMatch(dashboardScript, /history\.replaceState\([^)]*\/generation\?id=/);
  assert.match(dashboardScript, /\["queued", "processing"\]\.includes\(item\.status\)/);
  assert.match(
    resultScript,
    /requestJson\(`\/api\/generations\/\$\{encodeURIComponent\(state\.currentId\)\}`\)/
  );
  assert.match(
    resultScript,
    /requestJson\(`\/api\/generations\/\$\{encodeURIComponent\(state\.currentId\)\}\/status`\)/
  );
  assert.match(resultScript, /if \(isPending\(state\.result\)\) startPolling\(\)/);
  assert.match(resultScript, /if \(wasPending && isCompleted\(state\.result\)\)/);
  assert.match(resultScript, /if \(wasPending && isFailed\(state\.result\)\)/);
});

test("explicit sexual prompts are rejected with the safe educational message", () => {
  assert.throws(
    () => assertAllowedGenerationContent("أنشئ محتوى جنسي صريح"),
    /التعليمية الآمنة فقط/
  );
  assert.throws(
    () => assertAllowedGenerationContent("Create an explicit NSFW nude image"),
    /التعليمية الآمنة فقط/
  );
});

test("safe educational anatomy wording is not blocked by the explicit-content guard", () => {
  assert.equal(
    assertAllowedGenerationContent("رسم تعليمي مبسط لتشريح القلب البشري"),
    "رسم تعليمي مبسط لتشريح القلب البشري"
  );
});

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

test("simple Arabic child prompt is generated locally instead of being rejected", () => {
  const result = build("اعمل صورة ولد صغير جدا");

  assert.match(result.finalPrompt, /very young little boy|young boy|boy/i);
  assert.match(result.finalPrompt, /realistic high-quality portrait/i);
  assert.match(result.negativePrompt, /extra people/i);
  assert.match(result.negativePrompt, /office/i);
  assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/);
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

test("simple Arabic falcon prompts no longer fail when server translation is unavailable", () => {
  const goldenFalcon = buildSmartPromptEnhancement({
    userPrompt: "صقر ذهبي",
    quality: "high",
    style: "realistic",
    type: "image",
  });
  const whiteFalcon = buildSmartPromptEnhancement({
    userPrompt: "اعمل صقر أبيض",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(goldenFalcon.finalPrompt, /golden falcon/i);
  assert.match(whiteFalcon.finalPrompt, /white falcon/i);
  assert.doesNotMatch(goldenFalcon.finalPrompt, /[\u0600-\u06ff]/);
  assert.doesNotMatch(whiteFalcon.finalPrompt, /[\u0600-\u06ff]/);
});

test("simple animal prompts explicitly forbid grid and collage style outputs", () => {
  const result = buildSmartPromptEnhancement({
    userPrompt: "white chicken standing on a farm",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /one natural single image/i);
  assert.match(result.finalPrompt, /tiled layout|segmented frame|split-screen composition/i);
  assert.match(result.finalPrompt, /white separator lines|white borders/i);
  assert.match(result.negativePrompt, /photo grid/i);
  assert.match(result.negativePrompt, /collage/i);
  assert.match(result.negativePrompt, /mosaic/i);
});

test("short Arabic shark prompts enforce single-subject anti-collage rules", () => {
  const result = buildSmartPromptEnhancement({
    userPrompt: "اعمل صورة قرش احمر",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /shark/i);
  assert.match(result.finalPrompt, /red/i);
  assert.match(result.finalPrompt, /ONE SUBJECT ONLY/i);
  assert.match(result.finalPrompt, /NO DUPLICATES/i);
  assert.match(result.finalPrompt, /NO COLLAGE/i);
  assert.match(result.finalPrompt, /NO GRID/i);
  assert.match(result.negativePrompt, /duplicate subject/i);
  assert.match(result.negativePrompt, /multiple subjects/i);
  assert.match(result.negativePrompt, /collage/i);
});

test("short Arabic whale prompts enforce single-subject anti-collage rules", () => {
  const result = buildSmartPromptEnhancement({
    userPrompt: "اعمل صورة حوت ازرق",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /whale/i);
  assert.match(result.finalPrompt, /blue/i);
  assert.match(result.finalPrompt, /ONE SUBJECT ONLY/i);
  assert.match(result.finalPrompt, /NO COLLAGE/i);
  assert.match(result.negativePrompt, /duplicate subject/i);
  assert.match(result.negativePrompt, /multiple subjects/i);
});

test("short Arabic dolphin prompts enforce single-subject anti-collage rules", () => {
  const result = buildSmartPromptEnhancement({
    userPrompt: "اعمل صورة دلفين",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /dolphin/i);
  assert.match(result.finalPrompt, /ONE SUBJECT ONLY/i);
  assert.match(result.finalPrompt, /NO GRID/i);
  assert.match(result.negativePrompt, /duplicate subject/i);
  assert.match(result.negativePrompt, /collage/i);
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

test("Arabic man beside a large yellow bear in the forest preserves every requested concept", async () => {
  const result = await buildSmartPromptEnhancementAsync({
    userPrompt: "رجل بجانبه دب كبير لونه اصفر في الغابة",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /man/i);
  assert.match(result.finalPrompt, /large yellow bear|yellow large bear/i);
  assert.match(result.finalPrompt, /forest/i);
  assert.match(result.finalPrompt, /next to|beside/i);
  assert.doesNotMatch(result.finalPrompt, /business meeting|modern office|conference room|corporate office/i);
  assert.equal(result.debug.translationMode, "local-structured");
});

test("multi-subject marine prompts preserve dolphins beside a huge whale in one frame", () => {
  const result = buildSmartPromptEnhancement({
    userPrompt: "من فضلك اعمل دلافين جنبهم حوت ضخم",
    quality: "high",
    style: "realistic",
    type: "image",
  });

  assert.match(result.finalPrompt, /dolphins/i);
  assert.match(result.finalPrompt, /whale/i);
  assert.match(result.finalPrompt, /huge whale|whale must look clearly huge/i);
  assert.match(result.finalPrompt, /same frame|one coherent full-frame composition/i);
  assert.match(result.finalPrompt, /no collage|no split frames|no photo grid/i);
  assert.match(result.negativePrompt, /extra dolphins/i);
  assert.match(result.negativePrompt, /extra whales/i);
  assert.match(result.negativePrompt, /duplicate subjects/i);
});

const unusualArabicCases = [
  {
    prompt: "جمل شفاف يحمل مكتبة صغيرة فوق ظهره في صحراء زرقاء",
    translation:
      "A transparent camel carrying a small library on its back in a blue desert. The camel, library, and blue desert are all clearly visible.",
    expected: [/transparent camel/i, /small library/i, /blue desert/i],
  },
  {
    prompt: "ثلاث سمكات بنفسجية تطير فوق مدينة مقلوبة",
    translation:
      "Exactly three purple fish flying above an upside-down city. All three fish and the inverted city are fully visible.",
    expected: [/exactly three purple fish/i, /flying above/i, /upside-down city/i],
  },
  {
    prompt: "فيل مصنوع من التروس يسقي حديقة صغيرة على القمر",
    translation:
      "A clockwork elephant made of gears watering a small garden on the moon. The elephant, gears, garden, and lunar surface are visible.",
    expected: [/clockwork elephant/i, /watering a small garden/i, /moon/i],
  },
  {
    prompt: "مظلة حمراء تحت المحيط بجانب حوت أبيض",
    translation:
      "A red umbrella under the ocean next to a white whale. Both the umbrella and whale are fully visible underwater.",
    expected: [/red umbrella/i, /under the ocean/i, /white whale/i],
  },
  {
    prompt: "قطار زجاجي يعبر جسرًا من السحب في الليل",
    translation:
      "A glass train crossing a bridge made of clouds at night. The full train and cloud bridge are clearly visible.",
    expected: [/glass train/i, /bridge made of clouds/i, /at night/i],
  },
  {
    prompt: "رائدا فضاء يلعبان الشطرنج داخل إبريق شاي عملاق",
    translation:
      "Exactly two astronauts playing chess inside a giant teapot. Both astronauts, the chessboard, and the teapot interior are visible.",
    expected: [/exactly two astronauts/i, /playing chess/i, /inside a giant teapot/i],
  },
  {
    prompt: "بركان صغير فوق صدفة سلحفاة عملاقة",
    translation:
      "A small volcano on top of the shell of a giant turtle. The volcano, shell, and entire giant turtle are clearly visible.",
    expected: [/small volcano/i, /shell of a giant turtle/i, /clearly visible/i],
  },
  {
    prompt: "بومة ذهبية تقرأ كتابًا تحت الماء",
    translation:
      "A golden owl reading a book underwater. The owl and open book are fully visible beneath the water.",
    expected: [/golden owl/i, /reading a book/i, /underwater/i],
  },
  {
    prompt: "حصان أبيض بأجنحة فراشة داخل كهف جليدي",
    translation:
      "A white horse with butterfly wings inside an ice cave. The full horse, both wings, and icy cave are clearly visible.",
    expected: [/white horse/i, /butterfly wings/i, /inside an ice cave/i],
  },
  {
    prompt: "ساعة عملاقة تذوب فوق جبل بينما تمطر نجومًا",
    translation:
      "A giant melting clock on top of a mountain while stars rain from the sky. The clock, mountain, and falling stars are visible.",
    expected: [/giant melting clock/i, /on top of a mountain/i, /stars rain/i],
  },
];

test("ten unusual Arabic descriptions stay independent and preserve every requested concept", async () => {
  for (const item of unusualArabicCases) {
    const result = await buildSmartPromptEnhancementAsync(
      {
        userPrompt: item.prompt,
        quality: "high",
        style: "cinematic",
        type: "image",
      },
      { translatePrompt: async () => item.translation }
    );

    for (const expected of item.expected) {
      assert.match(result.finalPrompt, expected, item.prompt);
    }
    const positivePrompt = result.finalPrompt.split("\n\nStrict rules:")[0];
    assert.doesNotMatch(result.finalPrompt, /[\u0600-\u06ff]/, item.prompt);
    assert.doesNotMatch(positivePrompt, /business meeting|modern office|corporate portrait/i, item.prompt);
  }
});

test("semantic guard rejects stale business content introduced by a translator", async () => {
  await assert.rejects(
    () =>
      buildSmartPromptEnhancementAsync(
        {
          userPrompt: "حوت أزرق يسبح قرب جزيرة جليدية",
          quality: "high",
          style: "realistic",
          type: "image",
        },
        {
          translatePrompt: async () =>
            "A businessman holding a meeting in a modern corporate office beside a blue whale.",
        }
      ),
    (error) => error?.statusCode === 422 && /unrequested_people|unrequested_business_scene/.test(error.message)
  );
});

test("the Arabic word بينما never becomes a false between relation", async () => {
  const result = await buildSmartPromptEnhancementAsync(
    {
      userPrompt: "ساعة عملاقة تذوب فوق جبل بينما تمطر نجوما",
      quality: "high",
      style: "cinematic",
      type: "image",
    },
    {
      translatePrompt: async () =>
        "A giant melting clock on top of a mountain while stars rain from the sky.",
    }
  );

  assert.match(result.finalPrompt, /melting clock/i);
  assert.doesNotMatch(result.finalPrompt, /positioned between|left, center, and right/i);
});

test("animal hunting prompt never sends business concepts or inset-scene suggestions to the image model", async () => {
  const result = await buildSmartPromptEnhancementAsync(
    {
      userPrompt: "أسد في الغابة يلتهم غزال مع قطيعه",
      quality: "normal",
      style: "realistic",
      type: "image",
    },
    {
      translatePrompt: async () =>
        "A lion in a forest hunting and eating a gazelle while the rest of the lion pride remains visible nearby.",
    }
  );

  assert.match(result.finalPrompt, /lion/i);
  assert.match(result.finalPrompt, /gazelle/i);
  assert.match(result.finalPrompt, /forest/i);
  assert.match(result.finalPrompt, /one coherent full-frame scene/i);
  assert.match(result.finalPrompt, /No inset image, picture-in-picture/i);
  assert.doesNotMatch(
    result.finalPrompt,
    /businessman|business meeting|meeting room|conference room|corporate|office|restaurant|food|employees/i
  );
});

test("Arabic multi-subject animal scenes are routed as complex prompts", () => {
  const hunting = analyzePromptComplexity("أسد في الغابة يلتهم غزال مع قطيعه");
  const family = analyzePromptComplexity("ذئب كبير مع صغاره");
  const simple = analyzePromptComplexity("وردة حمراء");

  assert.equal(hunting.complex, true);
  assert.ok(hunting.subjects >= 3);
  assert.ok(hunting.relations >= 1);
  assert.equal(family.complex, true);
  assert.equal(isComplexGenerationPrompt("روبوت أخضر بجانب روبوت أصفر على القمر"), true);
  assert.equal(simple.complex, false);
});

test("visual validation rejects unrequested business inset content", () => {
  const validation = parseImageValidationPayload(
    JSON.stringify({
      passed: false,
      reason: "Unrequested businessmen appear in an inset panel.",
      unexpectedElements: ["businessmen", "inset panel"],
      missingElements: [],
    })
  );

  assert.equal(validation.checked, true);
  assert.equal(validation.passed, false);
  assert.deepEqual(validation.unexpectedElements, ["businessmen", "inset panel"]);
});

test("visual validation accepts a faithful single-scene animal result", () => {
  const validation = parseImageValidationPayload(
    JSON.stringify({
      passed: true,
      reason: "The lion, gazelle, pride, and forest are visible in one scene.",
      unexpectedElements: [],
      missingElements: [],
    })
  );

  assert.equal(validation.checked, true);
  assert.equal(validation.passed, true);
});
