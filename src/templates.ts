export type ProjectType = "script" | "website" | "app" | "desktop";

export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectTemplate {
  type: ProjectType;
  description: string;
  files(name: string): ProjectFile[];
}

const SCRIPT_MAIN = `note: Your first EngCode script.
say "Hello from EngCode!"

ask "What is your name?" and save it as name
say "Nice to meet you, " plus name plus "."
`;

const WEBSITE_MAIN = `app "My Website":
    page "Home":
        heading "Welcome"
        text "This page is written in plain English with EngCode."
        text "" called "message"
        button "Say hello" called "hello"
    end
end

style everything:
    font is modern
    background is #f8fafc
    text color is #1f2937
    padding is 48
end

style cards:
    background is white
    rounded corners is 16
    padding is 24
end

when "hello" is clicked:
    change text of "message" to "Hello from EngCode!"
end
`;

const APP_MAIN = `app "My App":
    page "Home":
        heading "Counter"
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
    padding is 40
end

style buttons:
    background is #2563eb
    text color is white
    rounded corners is 12
end
`;

const DESKTOP_MAIN = `app "My Desktop App":
    page "Home":
        heading "My Desktop App"
        text "This window is ready for your ideas."
        input called "name" with label "Your name"
        button "Greet me" called "greet"
        text "" called "greeting"
    end
end

style everything:
    font is windows
    background is #f3f3f3
    text color is #1b1b1b
    padding is 40
end

when "greet" is clicked:
    change text of "greeting" to "Hello, " plus value of "name" plus "!"
end
`;

const TEMPLATES: Record<ProjectType, ProjectTemplate> = {
  script: {
    type: "script",
    description: "a terminal script",
    files: () => [{ path: "main.eng", content: SCRIPT_MAIN }],
  },
  website: {
    type: "website",
    description: "a static website",
    files: () => [{ path: "main.eng", content: WEBSITE_MAIN }],
  },
  app: {
    type: "app",
    description: "a browser app",
    files: () => [{ path: "main.eng", content: APP_MAIN }],
  },
  desktop: {
    type: "desktop",
    description: "an Electron desktop app",
    files: () => [{ path: "main.eng", content: DESKTOP_MAIN }],
  },
};

export const PROJECT_TYPES: ProjectType[] = ["script", "website", "app", "desktop"];

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPES as string[]).includes(value.toLowerCase());
}

export function projectTemplate(type: ProjectType): ProjectTemplate {
  return TEMPLATES[type];
}

export function projectFiles(name: string, type: ProjectType): ProjectFile[] {
  const template = projectTemplate(type);
  const title = name.replace(/[-_]+/g, " ").trim() || name;
  return [
    ...template.files(name),
    {
      path: "engcode.json",
      content:
        JSON.stringify(
          {
            name,
            type,
            entry: "main.eng",
          },
          null,
          2,
        ) + "\n",
    },
    {
      path: ".gitignore",
      content: [".engcode/", "dist/", "node_modules/", ""].join("\n"),
    },
    {
      path: "README.md",
      content: [
        `# ${title}`,
        "",
        `This is ${template.description} written in EngCode.`,
        "",
        "```text",
        "engcode check main.eng",
        type === "script" ? "engcode run main.eng" : "engcode serve .",
        "```",
        "",
        "Build it with:",
        "",
        "```text",
        type === "script" ? "engcode run main.eng" : "engcode build web . --out dist",
        "```",
        "",
        "Learn the language with `engcode learn`.",
        "",
      ].join("\n"),
    },
  ];
}
