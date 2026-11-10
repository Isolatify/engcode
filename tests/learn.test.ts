import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { analyze } from "../src/program.js";
import { compileWeb } from "../src/web/compiler.js";
import {
  allLessons,
  findLesson,
  lessonIsCorrect,
  loadProgress,
  runLessonExample,
  saveProgress,
} from "../src/learn.js";

function tempFolder(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "engcode-learn-"));
}

test("the tutorial has exactly twenty numbered lessons", () => {
  const lessons = allLessons();
  assert.equal(lessons.length, 20);
  assert.deepEqual(
    lessons.map((lesson) => lesson.id),
    Array.from({ length: 20 }, (_, index) => index + 1),
  );
  assert.equal(findLesson(20)?.title, "State and storage");
  assert.equal(findLesson(21), undefined);
});

test("every lesson example parses and checks", () => {
  for (const lesson of allLessons()) {
    const folder = tempFolder();
    if (lesson.files && lesson.files.length > 0) {
      for (const file of lesson.files) fs.writeFileSync(path.join(folder, file.name), file.content);
      const file = path.join(folder, "main.eng");
      fs.writeFileSync(file, lesson.example);
      const analysis = analyze(file, lesson.example, { root: folder, allowApps: true });
      assert.deepEqual(
        analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"),
        [],
        `lesson ${lesson.id} should check cleanly`,
      );
      continue;
    }

    const analysis = analyze(path.join(folder, `lesson-${lesson.id}.eng`), lesson.example, {
      root: folder,
      modules: false,
      allowApps: true,
    });
    assert.deepEqual(
      analysis.diagnostics.filter((diagnostic) => diagnostic.severity !== "warning"),
      [],
      `lesson ${lesson.id} should check cleanly`,
    );
    if (lesson.app) {
      const build = compileWeb(analysis.program!, { root: folder, allowedHosts: [] });
      assert.deepEqual(build.diagnostics, [], `lesson ${lesson.id} should compile`);
      assert.ok(build.definition.pages.length > 0);
    }
  }
});

test("every runnable lesson example produces its expected output", () => {
  for (const lesson of allLessons()) {
    if (lesson.app || (lesson.files && lesson.files.length > 0)) continue;
    const folder = tempFolder();
    const result = runLessonExample(lesson, folder);
    assert.ok(result.ok, `lesson ${lesson.id}: ${result.diagnostics.join("\n")}`);
    assert.ok(
      lessonIsCorrect(lesson, result.output),
      `lesson ${lesson.id} printed:\n${result.output}\nexpected:\n${lesson.expected ?? ""}`,
    );
  }
});

test("app and module lessons explain how to run them", () => {
  const app = findLesson(17)!;
  const appResult = runLessonExample(app, tempFolder());
  assert.ok(appResult.ok);
  assert.match(appResult.output, /Built "Hello Page"/);

  const modules = findLesson(16)!;
  const moduleResult = runLessonExample(modules, tempFolder());
  assert.ok(moduleResult.ok);
  assert.match(moduleResult.output, /helpers\.eng/);
});

test("progress is saved and reloaded", () => {
  const folder = tempFolder();
  assert.deepEqual(loadProgress(folder), { completed: [], attempts: {} });
  saveProgress({ completed: [3, 1, 3], attempts: { "2": 1 } }, folder);
  assert.deepEqual(loadProgress(folder), { completed: [1, 3], attempts: { "2": 1 } });
});
