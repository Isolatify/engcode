const examples = {
  hello: `note: Your first program.
say "Hello, world!"

ask "What is your name?" and save it as name
say "Hello, " plus name plus "!"`,
  loops: `set total to 0
repeat 5 times:
    change total to total plus 1
end

count from 1 to 5 as number:
    say "Number " plus number
end

say "Total: " plus total`,
  lists: `set people to a list of a table with name "Sam", age 25 and a table with name "Ada", age 36

for each person in people:
    say person's name plus " is " plus person's age
end

set fruits to a list of "pear", "apple", "fig"
sort fruits
say join fruits with ", "`,
  functions: `define greet with who default "friend":
    give back "Hello, " plus who
end

define factorial with n:
    if n is at most 1:
        give back 1
    end
    give back n times (call factorial with n minus 1)
end

say greet "Sam"
say factorial 6`,
  app: `app "Playground App":
    page "Home":
        heading "A tiny app"
        text "0" called "count"
        button "Add one" called "add"
    end
end

keep track of total as 0

when "add" is clicked:
    change total to total plus 1
    change text of "count" to total
end

style everything:
    font is modern
    background is #eef2ff
    text color is #1e1b4b
    padding is 32
end`,
};

const editor = document.querySelector("#editor");
const output = document.querySelector("#output");
const diagnostics = document.querySelector("#diagnostics");
const status = document.querySelector("#status");
const runButton = document.querySelector("#run");
const examplesSelect = document.querySelector("#examples");
const inputs = document.querySelector("#inputs");
const frameWrap = document.querySelector("#app-frame");
const preview = document.querySelector("#preview");

editor.value = localStorage.getItem("engcode:playground") || examples.hello;

editor.addEventListener("input", () => {
  localStorage.setItem("engcode:playground", editor.value);
});

examplesSelect.addEventListener("change", () => {
  editor.value = examples[examplesSelect.value] || examples.hello;
  localStorage.setItem("engcode:playground", editor.value);
  editor.focus();
});

runButton.addEventListener("click", run);
editor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    run();
  }
});

async function run() {
  status.textContent = "Running…";
  status.className = "status";
  diagnostics.replaceChildren();
  frameWrap.hidden = true;
  output.hidden = false;
  output.textContent = "";

  const answers = inputs.value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: editor.value, inputs: answers }),
    });
    const result = await response.json();

    if (result.kind === "app") {
      output.hidden = true;
      frameWrap.hidden = false;
      preview.src = result.preview;
      status.textContent = "App preview";
      status.className = "status ok";
    } else if (result.kind === "script" && result.ok) {
      output.textContent = result.output || "(no output)";
      status.textContent = "Finished";
      status.className = "status ok";
    } else if (result.kind === "runtime") {
      output.textContent = result.output || "";
      status.textContent = "A runtime error";
      status.className = "status bad";
      addNote(result.message, true);
    } else {
      status.textContent = "Please fix the program";
      status.className = "status bad";
      for (const item of result.diagnostics || []) addNote(format(item), true);
    }

    for (const item of result.warnings || []) addNote(format(item), false);
  } catch (error) {
    status.textContent = "Could not reach the playground server";
    status.className = "status bad";
    addNote(error instanceof Error ? error.message : String(error), true);
  }
}

function format(item) {
  return item.line ? `Line ${item.line}: ${item.message}` : item.message;
}

function addNote(message, isError) {
  const note = document.createElement("div");
  note.className = isError ? "note" : "note warn";
  const title = document.createElement("strong");
  title.textContent = isError ? "Fix this" : "Note";
  const body = document.createElement("span");
  body.textContent = message;
  note.append(title, body);
  diagnostics.append(note);
}
