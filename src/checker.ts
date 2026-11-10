import type {
  AppEvent,
  AppStmt,
  Expression,
  PageStmt,
  Program,
  Statement,
  StyleStmt,
  TableEntry,
  UiNode,
} from "./ast.js";
import { Diagnostic, spanFromToken } from "./diagnostics.js";
import type { FunctionInfo, NameTable } from "./names.js";
import type { Token } from "./tokens.js";

type StaticType =
  | "number"
  | "text"
  | "boolean"
  | "nothing"
  | "list"
  | "table"
  | "function"
  | "object"
  | "unknown";

const BUILTIN_TYPES: Record<string, StaticType> = {
  uppercase: "text",
  lowercase: "text",
  trim: "text",
  length: "number",
  round: "number",
  floor: "number",
  ceiling: "number",
  "absolute value": "number",
  "square root": "number",
  sine: "number",
  cosine: "number",
  tangent: "number",
  "number from": "number",
  "random number": "number",
  "random decimal": "number",
  pi: "number",
  e: "number",
  text: "text",
  "JSON of": "text",
  position: "number",
  format: "text",
  now: "table",
  today: "text",
  "key pressed": "boolean",
  "file exists": "boolean",
  year: "number",
  month: "number",
  day: "number",
  hour: "number",
  minute: "number",
  second: "number",
};

export interface CheckResult {
  diagnostics: Diagnostic[];
}

interface KindInfo {
  fields: Set<string>;
  methods: Map<string, { paramCount: number; requiredCount: number }>;
}

export class Checker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly scopes: Set<string>[] = [];
  private readonly typeScopes: Map<string, StaticType>[] = [];
  private readonly kindScopes: Map<string, string>[] = [];
  private readonly kinds = new Map<string, KindInfo>();
  private readonly functions: Map<string, FunctionInfo>;
  private readonly globals = new Set<string>();
  private loopDepth = 0;
  private functionDepth = 0;
  private errorDepth = 0;
  private currentKind: string | null = null;
  private readonly appPages = new Map<string, PageStmt>();
  private readonly appIds = new Set<string>();
  private readonly appPageIds = new Map<string, Set<string>>();
  private readonly appStyles: StyleStmt[] = [];

  constructor(
    private readonly program: Program,
    private readonly names: NameTable,
    extraGlobals: Iterable<string> = [],
  ) {
    this.functions = names.functions;
    for (const name of extraGlobals) this.globals.add(name);
  }

  static check(
    program: Program,
    names: NameTable,
    extraGlobals: Iterable<string> = [],
  ): CheckResult {
    return new Checker(program, names, extraGlobals).run();
  }

  run(): CheckResult {
    this.collectKinds(this.program.body);
    this.collectGlobals(this.program.body);
    this.collectApps(this.program.body);
    this.scopes.push(new Set(this.globals));
    this.typeScopes.push(new Map());
    this.kindScopes.push(new Map());
    for (const statement of this.program.body) this.checkStatement(statement);
    for (const style of this.appStyles) this.checkStyle(style);
    this.scopes.pop();
    this.typeScopes.pop();
    this.kindScopes.pop();

    this.diagnostics.sort((a, b) => {
      const lineA = a.span?.line ?? 0;
      const lineB = b.span?.line ?? 0;
      if (lineA !== lineB) return lineA - lineB;
      return (a.span?.column ?? 0) - (b.span?.column ?? 0);
    });

    return { diagnostics: this.diagnostics };
  }

  private collectGlobals(statements: Statement[]): void {
    for (const statement of statements) {
      if (statement.kind === "set" && statement.target.kind === "variable") {
        this.globals.add(statement.target.name);
      } else if (
        statement.kind === "state" ||
        statement.kind === "ask" ||
        statement.kind === "read-file" ||
        statement.kind === "list-files" ||
        statement.kind === "load-device" ||
        statement.kind === "get-data" ||
        statement.kind === "send-data"
      ) {
        this.globals.add(statement.name);
      }
    }
  }

  private collectKinds(statements: Statement[]): void {
    for (const statement of statements) {
      if (statement.kind !== "kind") continue;
      const methods = new Map<string, { paramCount: number; requiredCount: number }>();
      for (const method of statement.methods) {
        const requiredCount = method.params.filter((param) => !param.defaultValue).length;
        methods.set(method.name, { paramCount: method.params.length, requiredCount });
      }
      this.kinds.set(statement.name, {
        fields: new Set(statement.fields.map((field) => field.name)),
        methods,
      });
    }
  }

  // ---------------------------------------------------------------- statements

  private checkStatement(statement: Statement): void {
    switch (statement.kind) {
      case "say":
        this.checkExpression(statement.value);
        return;

      case "ask":
        this.checkExpression(statement.prompt);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, statement.number ? "number" : "text");
        return;

      case "set":
        if (statement.target.kind === "variable") {
          this.checkExpression(statement.value);
          this.declareOrAssign(statement.target.name);
          this.assignType(statement.target.name, this.staticType(statement.value));
          this.noteKind(statement.target.name, statement.value);
        } else {
          this.checkTarget(statement.target, "read");
          this.checkExpression(statement.value);
        }
        return;

      case "change":
        this.checkTarget(statement.target, "change");
        this.checkExpression(statement.value);
        if (statement.target.kind === "variable") {
          this.assignType(statement.target.name, this.staticType(statement.value));
        }
        return;

      case "add":
        this.checkExpression(statement.value);
        this.checkTarget(statement.target, "change");
        return;

      case "remove":
        this.checkExpression(statement.value);
        this.checkTarget(statement.target, "change");
        return;

      case "if": {
        for (const branch of statement.branches) {
          this.checkCondition(branch.condition);
          this.pushScope();
          for (const inner of branch.body) this.checkStatement(inner);
          this.popScope();
        }
        if (statement.otherwise) {
          this.pushScope();
          for (const inner of statement.otherwise) this.checkStatement(inner);
          this.popScope();
        }
        return;
      }

      case "repeat": {
        this.checkNumber(statement.count, "repeat");
        this.loopDepth += 1;
        this.pushScope();
        for (const inner of statement.body) this.checkStatement(inner);
        this.popScope();
        this.loopDepth -= 1;
        return;
      }

      case "for-each": {
        this.checkExpression(statement.iterable);
        const iterableType = this.staticType(statement.iterable);
        if (iterableType !== "unknown" && iterableType !== "list" && iterableType !== "text") {
          this.report(
            `I can only repeat over a list or text, but this is ${typeArticle(iterableType)}.`,
            statement.iterable.token,
          );
        }
        this.loopDepth += 1;
        this.pushScope();
        this.declare(statement.name);
        this.setLocalType(statement.name, "unknown");
        for (const inner of statement.body) this.checkStatement(inner);
        this.popScope();
        this.loopDepth -= 1;
        return;
      }

      case "count": {
        this.checkNumber(statement.start, "count from");
        this.checkNumber(statement.end, "count to");
        this.loopDepth += 1;
        this.pushScope();
        this.declare(statement.name);
        this.setLocalType(statement.name, "number");
        for (const inner of statement.body) this.checkStatement(inner);
        this.popScope();
        this.loopDepth -= 1;
        return;
      }

      case "while":
        this.checkCondition(statement.condition);
        this.loopDepth += 1;
        this.pushScope();
        for (const inner of statement.body) this.checkStatement(inner);
        this.popScope();
        this.loopDepth -= 1;
        return;

      case "stop":
      case "skip":
        if (this.loopDepth === 0) {
          this.report(
            statement.kind === "stop"
              ? '"stop the loop" needs to be inside a loop.'
              : '"skip to the next one" needs to be inside a loop.',
            statement.token,
          );
        }
        return;

      case "define":
        this.checkFunctionBody(statement.name, statement.params, statement.body);
        return;

      case "give-back":
        if (this.functionDepth === 0) {
          this.report('"give back" needs to be inside a function.', statement.token);
        }
        if (statement.value) this.checkExpression(statement.value);
        return;

      case "try": {
        this.pushScope();
        for (const inner of statement.body) this.checkStatement(inner);
        this.popScope();

        this.errorDepth += 1;
        this.pushScope();
        for (const inner of statement.handler) this.checkStatement(inner);
        this.popScope();
        this.errorDepth -= 1;
        return;
      }

      case "state":
        this.checkExpression(statement.value);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, this.staticType(statement.value));
        this.noteKind(statement.name, statement.value);
        return;

      case "kind":
        this.checkKind(statement);
        return;

      case "read-file":
        this.checkExpression(statement.path);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, "text");
        return;

      case "write-file":
        this.checkExpression(statement.path);
        this.checkExpression(statement.value);
        return;

      case "delete-file":
        this.checkExpression(statement.path);
        return;

      case "list-files":
        this.checkExpression(statement.path);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, "list");
        return;

      case "wait":
        this.checkNumber(statement.seconds, "wait");
        return;

      case "save-device":
        this.checkExpression(statement.key);
        this.checkExpression(statement.value);
        return;

      case "load-device":
        this.checkExpression(statement.key);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, "unknown");
        return;

      case "delete-device":
        this.checkExpression(statement.key);
        return;

      case "get-data":
        this.checkExpression(statement.url);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, "unknown");
        return;

      case "send-data":
        this.checkExpression(statement.url);
        this.checkExpression(statement.value);
        this.declareOrAssign(statement.name);
        this.assignType(statement.name, "text");
        return;

      case "use":
        return;

      case "call-stmt":
        this.checkCall(statement.name, statement.args, statement.token);
        return;

      case "call-value-stmt":
        this.checkExpression(statement.callee);
        for (const arg of statement.args) this.checkExpression(arg);
        return;

      case "method-stmt": {
        if (!this.isVisible(statement.object)) {
          this.reportUnknown(statement.object, statement.token, "name");
        }
        for (const arg of statement.args) this.checkExpression(arg);
        const kindName =
          statement.object === "it"
            ? this.currentKind ?? undefined
            : this.kindOf(statement.object);
        const info = kindName ? this.kinds.get(kindName) : undefined;
        const method = info?.methods.get(statement.method);
        if (info && !method) {
          this.report(
            `A ${kindName} does not have a method called "${statement.method}".`,
            statement.token,
          );
        } else if (method) {
          if (statement.args.length < method.requiredCount) {
            const missing = method.requiredCount - statement.args.length;
            this.report(
              `"${statement.method}" needs ${missing} more ${missing === 1 ? "argument" : "arguments"}.`,
              statement.token,
            );
          } else if (statement.args.length > method.paramCount) {
            this.report(
              `"${statement.method}" takes ${method.paramCount} ${method.paramCount === 1 ? "argument" : "arguments"}, but ${statement.args.length} were given.`,
              statement.token,
            );
          }
        }
        return;
      }

      case "app":
        this.checkApp(statement);
        return;

      case "style":
        this.appStyles.push(statement);
        return;

      case "theme":
        return;

      case "when":
        this.checkEventTarget(statement.event, statement.token);
        for (const inner of statement.body) this.checkStatement(inner);
        return;

      case "every":
        for (const inner of statement.body) this.checkStatement(inner);
        return;

      case "show":
      case "hide":
      case "clear":
      case "open-popup":
      case "close-popup":
        this.requireElement(statement.id, statement.token, "screen element");
        return;

      case "change-of":
        this.requireElement(statement.id, statement.token, "screen element");
        this.checkExpression(statement.value);
        return;

      case "go-to-page":
        if (!this.appPages.has(statement.page.toLowerCase())) {
          this.report(
            `There is no page called "${statement.page}".`,
            statement.token,
            `Add page "${statement.page}": to the app, or use one of: ${[...this.appPages.keys()].join(", ")}.`,
          );
        }
        return;

      case "play-sound":
        this.checkExpression(statement.path);
        return;

      case "clear-canvas":
        this.requireElement(statement.id, statement.token, "canvas");
        return;

      case "draw": {
        this.requireElement(statement.id, statement.token, "canvas");
        for (const value of [
          statement.x,
          statement.y,
          statement.width,
          statement.height,
          statement.size,
          statement.text,
          statement.fromX,
          statement.fromY,
          statement.toX,
          statement.toY,
          statement.path,
        ]) {
          if (value) this.checkExpression(value);
        }
        return;
      }

      case "sort":
      case "reverse":
      case "shuffle":
        this.checkExpression(statement.value);
        return;
    }
  }

  // -------------------------------------------------------------------- apps

  private collectApps(statements: Statement[]): void {
    for (const statement of statements) {
      if (statement.kind !== "app") continue;
      for (const page of statement.pages) {
        const key = page.name.toLowerCase();
        const previous = this.appPages.get(key);
        if (previous) {
          this.report(
            `There are two pages called "${page.name}".`,
            page.token,
            "Give each page its own name.",
          );
          continue;
        }
        this.appPages.set(key, page);
        const ids = new Set<string>();
        this.appPageIds.set(key, ids);
        this.collectIds(page.body, ids);
        for (const id of ids) this.appIds.add(id);
      }
    }
  }

  private collectIds(nodes: UiNode[], into: Set<string>): void {
    for (const node of nodes) {
      if (node.id) {
        const key = node.id.toLowerCase();
        if (into.has(key)) {
          this.report(
            `The id "${node.id}" is used twice on this page.`,
            node.token,
            "Ids name one element. Give this one a different id.",
          );
        } else {
          into.add(key);
        }
      }
      this.collectIds(node.children, into);
    }
  }

  private checkApp(statement: AppStmt): void {
    for (const page of statement.pages) {
      this.checkPageAccessibility(page);
      this.checkUiExpressions(page.body);
    }
  }

  private checkPageAccessibility(page: PageStmt): void {
    let previousLevel = 0;
    let sawHeading = false;
    const visit = (nodes: UiNode[]): void => {
      for (const node of nodes) {
        if (node.element === "heading") {
          const level = node.level ?? 1;
          sawHeading = true;
          if (level > previousLevel + 1 && previousLevel > 0) {
            this.warn(
              `This heading jumps from level ${previousLevel} to level ${level}.`,
              node.token,
              `Use level ${previousLevel + 1}, or add the heading levels in between.`,
            );
          }
          previousLevel = level;
        }
        if (node.element === "image" && !node.description) {
          this.warn(
            "This image has no description.",
            node.token,
            'Add with description "..." so screen readers can describe it.',
          );
        }
        if (
          node.element === "input" ||
          node.element === "text area" ||
          node.element === "dropdown" ||
          node.element === "slider" ||
          node.element === "checkbox" ||
          node.element === "switch"
        ) {
          if (!node.label && !node.id) {
            this.warn(
              "This input has no label and no id.",
              node.token,
              'Add called "id" or with label "...".',
            );
          }
        }
        if (node.element === "link" && node.linkTo?.kind === "text") {
          this.checkLink(String(node.linkTo.value), node.token);
        }
        visit(node.children);
      }
    };
    visit(page.body);
    if (!sawHeading) {
      this.warn(
        `The page "${page.name}" has no heading.`,
        page.token,
        "Add heading \"...\" as the first thing on the page.",
      );
    }
  }

  private checkUiExpressions(nodes: UiNode[]): void {
    for (const node of nodes) {
      for (const expression of [
        node.label,
        node.hint,
        node.starting,
        node.description,
        node.showing,
        node.linkTo,
        node.minimum,
        node.maximum,
        node.width,
        node.height,
        ...node.choices,
        ...node.columns,
      ]) {
        if (expression) this.checkExpression(expression);
      }
      if (node.showing) {
        const type = this.staticType(node.showing);
        if (type !== "unknown" && type !== "list" && type !== "table") {
          this.warn(
            "A list or table can only show a list of values.",
            node.showing.token,
          );
        }
      }
      this.checkUiExpressions(node.children);
    }
  }

  private checkEventTarget(event: AppEvent, token: Token): void {
    if ("id" in event) {
      this.requireElement(event.id, token, "screen element");
    }
    if (event.type === "page-open" && event.page && !this.appPages.has(event.page.toLowerCase())) {
      this.report(`There is no page called "${event.page}".`, token);
    }
  }

  private requireElement(id: string, token: Token, kind: string): void {
    if (!this.appIds.has(id.toLowerCase())) {
      this.report(
        `There is no ${kind} called "${id}".`,
        token,
        "Check the id in quotes, or add called \"...\" to the block.",
      );
    }
  }

  private checkLink(target: string, token: Token): void {
    const lower = target.trim().toLowerCase();
    if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
      this.report(
        "That link is not safe.",
        token,
        'Use an http, https, mailto, tel, or #page link.',
      );
    }
  }

  private checkStyle(style: StyleStmt): void {
    if (style.targetType === "id" && !this.appIds.has(style.target.toLowerCase())) {
      this.report(
        `The style target "${style.target}" is not on any page.`,
        style.token,
        "Check the id, or add called \"...\" to the block you want to style.",
      );
    }
  }

  private checkFunctionBody(
    name: string,
    params: { name: string; defaultValue?: Expression }[],
    body: Statement[],
  ): void {
    const savedLoopDepth = this.loopDepth;
    const savedErrorDepth = this.errorDepth;
    this.loopDepth = 0;
    this.errorDepth = 0;
    this.functionDepth += 1;

    this.pushScope();
    for (const param of params) this.declare(param.name);
    for (const param of params) {
      if (param.defaultValue) this.checkExpression(param.defaultValue);
    }
    for (const statement of body) this.checkStatement(statement);
    this.popScope();

    this.functionDepth -= 1;
    this.loopDepth = savedLoopDepth;
    this.errorDepth = savedErrorDepth;

    // Keep the function name visible inside itself for recursion.
    if (!this.isVisible(name)) this.declare(name);
  }

  private checkKind(statement: Extract<Statement, { kind: "kind" }>): void {
    const savedKind = this.currentKind;
    this.currentKind = statement.name;
    for (const method of statement.methods) {
      this.checkMethod(statement.name, method.params, method.body);
    }
    this.currentKind = savedKind;
    if (!this.isVisible(statement.name)) this.declare(statement.name);
  }

  private checkMethod(
    kindName: string,
    params: { name: string; defaultValue?: Expression }[],
    body: Statement[],
  ): void {
    const savedLoopDepth = this.loopDepth;
    const savedErrorDepth = this.errorDepth;
    this.loopDepth = 0;
    this.errorDepth = 0;
    this.functionDepth += 1;

    this.pushScope();
    this.declare("it");
    this.setLocalType("it", "object");
    this.setLocalKind("it", kindName);
    const info = this.kinds.get(kindName);
    if (info) {
      for (const field of info.fields) {
        this.declare(field);
        this.setLocalType(field, "unknown");
      }
    }
    for (const param of params) this.declare(param.name);
    for (const param of params) {
      if (param.defaultValue) this.checkExpression(param.defaultValue);
    }
    for (const statement of body) this.checkStatement(statement);
    this.popScope();

    this.functionDepth -= 1;
    this.loopDepth = savedLoopDepth;
    this.errorDepth = savedErrorDepth;
  }

  // ------------------------------------------------------------------ targets

  private checkTarget(target: Expression, mode: "read" | "change"): void {
    if (target.kind === "variable") {
      if (!this.isVisible(target.name)) {
        this.reportUnknown(target.name, target.token, mode === "change" ? "change" : "name");
      }
      return;
    }
    if (target.kind === "property") {
      this.checkExpression(target.base);
      return;
    }
    this.checkExpression(target);
  }

  // --------------------------------------------------------------- expressions

  private checkExpression(expression: Expression): void {
    switch (expression.kind) {
      case "number":
      case "text":
      case "boolean":
      case "nothing":
        return;

      case "variable":
        if (!this.isVisible(expression.name)) {
          this.reportUnknown(expression.name, expression.token, "name");
        }
        return;

      case "property": {
        this.checkExpression(expression.base);
        const baseType = this.staticType(expression.base);
        if (
          baseType !== "unknown" &&
          baseType !== "table" &&
          baseType !== "object"
        ) {
          this.report(
            `I can only read properties from a table or object, but this is ${typeArticle(baseType)}.`,
            expression.token,
          );
        }
        return;
      }

      case "unary":
        if (expression.operator === "minus") {
          this.checkExpression(expression.operand);
          this.checkIsNumber(expression.operand, "minus");
        } else {
          this.checkCondition(expression.operand);
        }
        return;

      case "binary":
        if (expression.operator === "and" || expression.operator === "or") {
          this.checkCondition(expression.left);
          this.checkCondition(expression.right);
          return;
        }
        this.checkExpression(expression.left);
        this.checkExpression(expression.right);
        if (expression.operator === "plus") {
          const left = this.staticType(expression.left);
          const right = this.staticType(expression.right);
          if (left !== "unknown" && right !== "unknown" && left !== "text" && right !== "text") {
            if (left !== "number" || right !== "number") {
              this.report(
                `I can't join ${typeArticle(left)} and ${typeArticle(right)} with "plus".`,
                expression.token,
                'Use text in quotes, or "text of" to turn a value into text.',
              );
            }
          }
          return;
        }
        this.checkIsNumber(expression.left, expression.operator);
        this.checkIsNumber(expression.right, expression.operator);
        return;

      case "comparison":
        this.checkComparison(expression);
        return;

      case "call":
        this.checkCall(expression.name, expression.args, expression.token);
        return;

      case "call-value":
        this.checkExpression(expression.callee);
        for (const arg of expression.args) this.checkExpression(arg);
        return;

      case "function-ref":
        if (!this.functions.has(expression.name)) {
          this.reportUnknown(expression.name, expression.token, "function");
        }
        return;

      case "error-ref":
        if (this.errorDepth === 0) {
          this.report('"the error" only works inside "if it fails".', expression.token);
        }
        return;

      case "builtin":
        for (const arg of expression.args) this.checkExpression(arg);
        this.checkBuiltinTypes(expression.name, expression.args, expression.token);
        return;

      case "list":
        for (const item of expression.items) this.checkExpression(item);
        return;

      case "table":
        this.checkEntries(expression.entries);
        return;

      case "function":
        this.checkFunctionLiteral(expression);
        return;

      case "new": {
        if (!this.names.kinds.has(expression.kindName)) {
          this.reportUnknown(expression.kindName, expression.token, "kind");
        }
        this.checkEntries(expression.entries);
        const info = this.kinds.get(expression.kindName);
        if (info) {
          for (const entry of expression.entries) {
            if (!info.fields.has(entry.key)) {
              this.report(
                `A ${expression.kindName} does not have a field called "${entry.key}".`,
                entry.token,
              );
            }
          }
          const given = new Set(expression.entries.map((entry) => entry.key));
          const missing = [...info.fields].filter((field) => !given.has(field));
          if (missing.length > 0) {
            this.report(
              `A ${expression.kindName} needs ${missing.length === 1 ? "a value" : "values"} for ${missing.map((field) => `"${field}"`).join(", ")}.`,
              expression.token,
            );
          }
        }
        return;
      }
    }
  }

  private checkEntries(entries: TableEntry[]): void {
    for (const entry of entries) this.checkExpression(entry.value);
  }

  private checkFunctionLiteral(expression: Extract<Expression, { kind: "function" }>): void {
    const savedLoopDepth = this.loopDepth;
    const savedErrorDepth = this.errorDepth;
    this.loopDepth = 0;
    this.errorDepth = 0;
    this.functionDepth += 1;
    this.pushScope();
    for (const param of expression.params) this.declare(param.name);
    for (const param of expression.params) {
      if (param.defaultValue) this.checkExpression(param.defaultValue);
    }
    if (expression.expressionBody) {
      this.checkExpression(expression.expressionBody);
    } else {
      for (const statement of expression.body) this.checkStatement(statement);
    }
    this.popScope();
    this.functionDepth -= 1;
    this.loopDepth = savedLoopDepth;
    this.errorDepth = savedErrorDepth;
  }

  private checkComparison(expression: Extract<Expression, { kind: "comparison" }>): void {
    this.checkExpression(expression.left);
    for (const right of expression.right) this.checkExpression(right);

    const leftType = this.staticType(expression.left);
    const rightType = expression.right[0] ? this.staticType(expression.right[0]) : "unknown";

    switch (expression.operator) {
      case "greater than":
      case "less than":
      case "at least":
      case "at most":
      case "between": {
        const otherType = expression.operator === "between" && expression.right[1]
          ? this.staticType(expression.right[1])
          : rightType;
        this.checkOrderable(leftType, expression.left.token);
        this.checkOrderable(rightType, expression.right[0]?.token ?? expression.token);
        if (expression.operator === "between" && expression.right[1]) {
          this.checkOrderable(otherType, expression.right[1].token);
        }
        if (
          leftType !== "unknown" &&
          rightType !== "unknown" &&
          leftType !== rightType
        ) {
          this.report(
            `I can't compare ${typeArticle(leftType)} with ${typeArticle(rightType)}.`,
            expression.token,
          );
        }
        return;
      }

      case "contains":
        if (
          leftType !== "unknown" &&
          leftType !== "text" &&
          leftType !== "list" &&
          leftType !== "table"
        ) {
          this.report(
            `"contains" needs text, a list, or a table, but this is ${typeArticle(leftType)}.`,
            expression.token,
          );
        }
        return;

      case "starts with":
      case "ends with":
        if (leftType !== "unknown" && leftType !== "text") {
          this.report(
            `"${expression.operator}" needs text, but this is ${typeArticle(leftType)}.`,
            expression.token,
          );
        }
        if (rightType !== "unknown" && rightType !== "text") {
          this.report(
            `"${expression.operator}" needs text on both sides.`,
            expression.token,
          );
        }
        return;

      case "is empty":
      case "is not empty":
        if (
          leftType !== "unknown" &&
          leftType !== "text" &&
          leftType !== "list" &&
          leftType !== "table" &&
          leftType !== "nothing"
        ) {
          this.report(
            `"${expression.operator}" needs text, a list, a table, or nothing.`,
            expression.token,
          );
        }
        return;

      case "is":
      case "is not":
        return;
    }
  }

  private checkBuiltinTypes(name: string, args: Expression[], token: Token): void {
    if (name === "length" && args[0]) {
      const type = this.staticType(args[0]);
      if (type !== "unknown" && type !== "text" && type !== "list" && type !== "table") {
        this.report(`"length of" needs text, a list, or a table.`, token);
      }
    }
    if (name === "item" && args[1]) {
      const type = this.staticType(args[1]);
      if (type !== "unknown" && type !== "list" && type !== "text") {
        this.report(`"item ... of" needs a list or text.`, token);
      }
    }
    if (name === "last item" && args[0]) {
      const type = this.staticType(args[0]);
      if (type !== "unknown" && type !== "list" && type !== "text") {
        this.report(`"last item of" needs a list or text.`, token);
      }
    }
    if (
      (name === "uppercase" || name === "lowercase" || name === "trim") &&
      args[0]
    ) {
      const type = this.staticType(args[0]);
      if (type !== "unknown" && type !== "text") {
        this.report(`"${name} of" needs text.`, token);
      }
    }
  }

  private checkCall(name: string, args: Expression[], token: Token): void {
    for (const arg of args) this.checkExpression(arg);
    const info = this.functions.get(name);
    if (!info) {
      this.reportUnknown(name, token, "function");
      return;
    }
    if (args.length < info.requiredCount) {
      const missing = info.requiredCount - args.length;
      this.report(
        `"${name}" needs ${missing} more ${missing === 1 ? "argument" : "arguments"}.`,
        token,
      );
    } else if (args.length > info.paramCount) {
      this.report(
        `"${name}" takes ${info.paramCount} ${info.paramCount === 1 ? "argument" : "arguments"}, but ${args.length} were given.`,
        token,
      );
    }
  }

  private checkCondition(expression: Expression): void {
    this.checkExpression(expression);
    const type = this.staticType(expression);
    if (
      type !== "unknown" &&
      type !== "boolean"
    ) {
      this.report(
        `A condition must be yes or no, but this is ${typeArticle(type)}.`,
        expression.token,
        'Write a comparison, as in "if age is greater than 17:". EngCode does not treat other values as true or false.',
      );
    }
  }

  private checkNumber(expression: Expression, context: string): void {
    this.checkExpression(expression);
    this.checkIsNumber(expression, context);
  }

  private checkIsNumber(expression: Expression, context: string): void {
    const type = this.staticType(expression);
    if (type !== "unknown" && type !== "number") {
      this.report(
        `"${context}" needs a number, but this is ${typeArticle(type)}.`,
        expression.token,
      );
    }
  }

  private checkOrderable(type: StaticType, token: Token): void {
    if (type !== "unknown" && type !== "number" && type !== "text") {
      this.report(
        `I can only put numbers or text in order, but this is ${typeArticle(type)}.`,
        token,
      );
    }
  }

  // ------------------------------------------------------------------- static

  private staticType(expression: Expression): StaticType {
    switch (expression.kind) {
      case "number":
        return "number";
      case "text":
        return "text";
      case "boolean":
        return "boolean";
      case "nothing":
        return "nothing";
      case "list":
        return "list";
      case "table":
        return "table";
      case "function":
        return "function";
      case "new":
        return "object";
      case "comparison":
      case "error-ref":
        return expression.kind === "error-ref" ? "text" : "boolean";
      case "unary":
        return expression.operator === "not" ? "boolean" : "number";
      case "binary":
        if (expression.operator === "and" || expression.operator === "or") return "boolean";
        if (expression.operator === "plus") {
          const left = this.staticType(expression.left);
          const right = this.staticType(expression.right);
          if (left === "text" || right === "text") return "text";
          return "number";
        }
        return "number";
      case "builtin":
        return BUILTIN_TYPES[expression.name] ?? "unknown";
      case "property": {
        if (expression.base.kind === "variable") {
          const kindName =
            expression.base.name === "it"
              ? this.currentKind ?? undefined
              : this.kindOf(expression.base.name);
          const info = kindName ? this.kinds.get(kindName) : undefined;
          if (info?.methods.has(expression.key)) return "function";
        }
        return "unknown";
      }
      case "function-ref":
        return "function";
      case "variable":
        return this.typeOf(expression.name);
      case "call":
      case "call-value":
        return "unknown";
    }
  }

  // ------------------------------------------------------------------- scopes

  private pushScope(): void {
    this.scopes.push(new Set());
    this.typeScopes.push(new Map());
    this.kindScopes.push(new Map());
  }

  private popScope(): void {
    this.scopes.pop();
    this.typeScopes.pop();
    this.kindScopes.pop();
  }

  private declare(name: string): void {
    this.scopes[this.scopes.length - 1]!.add(name);
  }

  private declareOrAssign(name: string): void {
    if (this.isVisible(name)) return;
    this.declare(name);
  }

  /** Records a type in the nearest scope that already defines the name. */
  private assignType(name: string, type: StaticType): void {
    for (let i = this.typeScopes.length - 1; i >= 0; i -= 1) {
      if (this.typeScopes[i]!.has(name)) {
        this.typeScopes[i]!.set(name, type);
        return;
      }
    }
    this.typeScopes[this.typeScopes.length - 1]!.set(name, type);
  }

  /** Records a type for a name declared in the current scope, such as a loop variable. */
  private setLocalType(name: string, type: StaticType): void {
    this.typeScopes[this.typeScopes.length - 1]!.set(name, type);
  }

  private typeOf(name: string): StaticType {
    for (let i = this.typeScopes.length - 1; i >= 0; i -= 1) {
      const type = this.typeScopes[i]!.get(name);
      if (type !== undefined) return type;
    }
    return "unknown";
  }

  /** Records the object kind produced by a value, so methods can be checked. */
  private noteKind(name: string, value: Expression): void {
    const kindName = value.kind === "new" ? value.kindName : undefined;
    if (kindName) this.assignKind(name, kindName);
    else this.assignKind(name, undefined);
  }

  private assignKind(name: string, kindName: string | undefined): void {
    for (let i = this.kindScopes.length - 1; i >= 0; i -= 1) {
      if (this.kindScopes[i]!.has(name)) {
        if (kindName) this.kindScopes[i]!.set(name, kindName);
        else this.kindScopes[i]!.delete(name);
        return;
      }
    }
    if (kindName) this.kindScopes[this.kindScopes.length - 1]!.set(name, kindName);
  }

  private setLocalKind(name: string, kindName: string): void {
    this.kindScopes[this.kindScopes.length - 1]!.set(name, kindName);
  }

  private kindOf(name: string): string | undefined {
    for (let i = this.kindScopes.length - 1; i >= 0; i -= 1) {
      const kindName = this.kindScopes[i]!.get(name);
      if (kindName !== undefined) return kindName;
    }
    return undefined;
  }

  private isVisible(name: string): boolean {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      if (this.scopes[i]!.has(name)) return true;
    }
    return false;
  }

  private visibleNames(): string[] {
    const names = new Set<string>();
    for (const scope of this.scopes) {
      for (const name of scope) names.add(name);
    }
    for (const name of this.functions.keys()) names.add(name);
    for (const name of this.names.kinds) names.add(name);
    return [...names];
  }

  private reportUnknown(name: string, token: Token, kind: "name" | "function" | "change" | "kind"): void {
    let message: string;
    if (kind === "function") {
      message = `I don't know a function called "${name}".`;
    } else if (kind === "change") {
      message = `I don't know the name "${name}". Use "set" to create it first.`;
    } else if (kind === "kind") {
      message = `I don't know a kind called "${name}".`;
    } else {
      message = `I don't know the name "${name}".`;
    }

    const suggestion = closestName(name, this.visibleNames());
    this.diagnostics.push(
      new Diagnostic(
        message,
        spanFromToken(token),
        undefined,
        suggestion ? `Did you mean "${suggestion}"?` : "Check the spelling, or use \"set\" to create the name.",
      ),
    );
  }

  private report(message: string, token: Token, suggestion?: string): void {
    this.diagnostics.push(new Diagnostic(message, spanFromToken(token), suggestion));
  }

  private warn(message: string, token: Token, suggestion?: string): void {
    this.diagnostics.push(
      new Diagnostic(message, spanFromToken(token), suggestion, undefined, "warning"),
    );
  }
}

function typeArticle(type: StaticType): string {
  switch (type) {
    case "number":
      return "a number";
    case "text":
      return "text";
    case "boolean":
      return "yes or no";
    case "nothing":
      return "nothing";
    case "list":
      return "a list";
    case "table":
      return "a table";
    case "function":
      return "a function";
    case "object":
      return "an object";
    default:
      return "an unknown value";
  }
}

function closestName(name: string, candidates: string[]): string | null {
  if (name.length < 3) return null;
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate === name) continue;
    const distance = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const limit = Math.max(2, Math.floor(name.length / 3));
  return bestDistance <= limit ? best : null;
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const columns = b.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => Array(columns).fill(0));
  for (let i = 0; i < rows; i += 1) table[i]![0] = i;
  for (let j = 0; j < columns; j += 1) table[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      table[i]![j] = Math.min(
        table[i - 1]![j]! + 1,
        table[i]![j - 1]! + 1,
        table[i - 1]![j - 1]! + cost,
      );
    }
  }
  return table[rows - 1]![columns - 1]!;
}
