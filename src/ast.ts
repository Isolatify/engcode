import type { Token } from "./tokens.js";

export interface Program {
  kind: "program";
  body: Statement[];
}

export type Expression =
  | NumberLiteral
  | TextLiteral
  | BooleanLiteral
  | NothingLiteral
  | VariableExpr
  | PropertyExpr
  | UnaryExpr
  | BinaryExpr
  | ComparisonExpr
  | CallExpr
  | CallValueExpr
  | FunctionRefExpr
  | ErrorRefExpr
  | BuiltinExpr
  | ListExpr
  | TableExpr
  | FunctionExpr
  | NewExpr;

export interface NumberLiteral {
  kind: "number";
  value: number;
  token: Token;
}

export interface TextLiteral {
  kind: "text";
  value: string;
  token: Token;
}

export interface BooleanLiteral {
  kind: "boolean";
  value: boolean;
  token: Token;
}

export interface NothingLiteral {
  kind: "nothing";
  token: Token;
}

export interface VariableExpr {
  kind: "variable";
  name: string;
  token: Token;
}

export interface PropertyExpr {
  kind: "property";
  base: Expression;
  key: string;
  token: Token;
}

export type UnaryOperator = "minus" | "not";

export interface UnaryExpr {
  kind: "unary";
  operator: UnaryOperator;
  operand: Expression;
  token: Token;
}

export type BinaryOperator = "plus" | "minus" | "times" | "divided by" | "remainder" | "and" | "or";

export interface BinaryExpr {
  kind: "binary";
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
  token: Token;
}

export type ComparisonOperator =
  | "is"
  | "is not"
  | "greater than"
  | "less than"
  | "at least"
  | "at most"
  | "between"
  | "contains"
  | "starts with"
  | "ends with"
  | "is empty"
  | "is not empty";

export interface ComparisonExpr {
  kind: "comparison";
  operator: ComparisonOperator;
  left: Expression;
  /** One value for most comparisons, two for "between", none for empty tests. */
  right: Expression[];
  token: Token;
}

export interface CallExpr {
  kind: "call";
  name: string;
  args: Expression[];
  token: Token;
}

export interface CallValueExpr {
  kind: "call-value";
  callee: Expression;
  args: Expression[];
  token: Token;
}

export interface FunctionRefExpr {
  kind: "function-ref";
  name: string;
  token: Token;
}

export interface ErrorRefExpr {
  kind: "error-ref";
  token: Token;
}

export interface BuiltinExpr {
  kind: "builtin";
  /** Canonical built-in name, such as "uppercase" or "random number". */
  name: string;
  args: Expression[];
  token: Token;
}

export interface ListExpr {
  kind: "list";
  items: Expression[];
  token: Token;
}

export interface TableEntry {
  key: string;
  value: Expression;
  token: Token;
}

export interface TableExpr {
  kind: "table";
  entries: TableEntry[];
  token: Token;
}

export interface Parameter {
  name: string;
  defaultValue?: Expression;
  token: Token;
}

export interface FunctionExpr {
  kind: "function";
  params: Parameter[];
  body: Statement[];
  /** When set, the function is a one-line "that gives back" function. */
  expressionBody?: Expression;
  token: Token;
}

export interface NewExpr {
  kind: "new";
  kindName: string;
  entries: TableEntry[];
  token: Token;
}

export type Statement =
  | SayStmt
  | AskStmt
  | SetStmt
  | ChangeStmt
  | AddStmt
  | RemoveStmt
  | IfStmt
  | RepeatStmt
  | ForEachStmt
  | CountStmt
  | WhileStmt
  | StopStmt
  | SkipStmt
  | DefineStmt
  | GiveBackStmt
  | TryStmt
  | UseStmt
  | StateStmt
  | CallStmt
  | CallValueStmt
  | MethodStmt
  | SortStmt
  | ReverseStmt
  | ShuffleStmt
  | KindStmt
  | ReadFileStmt
  | WriteFileStmt
  | DeleteFileStmt
  | ListFilesStmt
  | WaitStmt
  | SaveDeviceStmt
  | LoadDeviceStmt
  | DeleteDeviceStmt
  | GetDataStmt
  | SendDataStmt
  | AppStmt
  | StyleStmt
  | ThemeStmt
  | WhenStmt
  | EveryStmt
  | ShowStmt
  | HideStmt
  | ClearStmt
  | ChangeOfStmt
  | GoToPageStmt
  | PopupStmt
  | PlaySoundStmt
  | ClearCanvasStmt
  | DrawStmt;

export interface SayStmt {
  kind: "say";
  value: Expression;
  token: Token;
}

export interface AskStmt {
  kind: "ask";
  prompt: Expression;
  name: string;
  number: boolean;
  token: Token;
}

export interface SetStmt {
  kind: "set";
  target: Expression;
  value: Expression;
  token: Token;
}

export interface ChangeStmt {
  kind: "change";
  target: Expression;
  value: Expression;
  token: Token;
}

export interface AddStmt {
  kind: "add";
  value: Expression;
  target: Expression;
  token: Token;
}

export interface RemoveStmt {
  kind: "remove";
  value: Expression;
  target: Expression;
  token: Token;
}

export interface IfBranch {
  condition: Expression;
  body: Statement[];
  token: Token;
}

export interface IfStmt {
  kind: "if";
  branches: IfBranch[];
  otherwise?: Statement[];
  token: Token;
}

export interface RepeatStmt {
  kind: "repeat";
  count: Expression;
  body: Statement[];
  token: Token;
}

export interface ForEachStmt {
  kind: "for-each";
  name: string;
  iterable: Expression;
  body: Statement[];
  token: Token;
}

export interface CountStmt {
  kind: "count";
  start: Expression;
  end: Expression;
  name: string;
  body: Statement[];
  token: Token;
}

export interface WhileStmt {
  kind: "while";
  condition: Expression;
  body: Statement[];
  token: Token;
}

export interface StopStmt {
  kind: "stop";
  token: Token;
}

export interface SkipStmt {
  kind: "skip";
  token: Token;
}

export interface DefineStmt {
  kind: "define";
  name: string;
  params: Parameter[];
  body: Statement[];
  token: Token;
}

export interface GiveBackStmt {
  kind: "give-back";
  value?: Expression;
  token: Token;
}

export interface TryStmt {
  kind: "try";
  body: Statement[];
  handler: Statement[];
  token: Token;
}

export interface UseStmt {
  kind: "use";
  target: string;
  isPath: boolean;
  isTheme: boolean;
  token: Token;
}

export interface StateStmt {
  kind: "state";
  name: string;
  value: Expression;
  token: Token;
}

export interface CallStmt {
  kind: "call-stmt";
  name: string;
  args: Expression[];
  token: Token;
}

export interface CallValueStmt {
  kind: "call-value-stmt";
  callee: Expression;
  args: Expression[];
  token: Token;
}

export interface MethodStmt {
  kind: "method-stmt";
  object: string;
  method: string;
  args: Expression[];
  token: Token;
}

export interface SortStmt {
  kind: "sort";
  value: Expression;
  descending: boolean;
  token: Token;
}

export interface ReverseStmt {
  kind: "reverse";
  value: Expression;
  token: Token;
}

export interface ShuffleStmt {
  kind: "shuffle";
  value: Expression;
  token: Token;
}

export interface FieldDecl {
  name: string;
  token: Token;
}

export interface MethodDecl {
  name: string;
  params: Parameter[];
  body: Statement[];
  token: Token;
}

export interface KindStmt {
  kind: "kind";
  name: string;
  fields: FieldDecl[];
  methods: MethodDecl[];
  token: Token;
}

export interface ReadFileStmt {
  kind: "read-file";
  path: Expression;
  name: string;
  token: Token;
}

export interface WriteFileStmt {
  kind: "write-file";
  path: Expression;
  value: Expression;
  append: boolean;
  token: Token;
}

export interface DeleteFileStmt {
  kind: "delete-file";
  path: Expression;
  token: Token;
}

export interface ListFilesStmt {
  kind: "list-files";
  path: Expression;
  name: string;
  token: Token;
}

export interface WaitStmt {
  kind: "wait";
  seconds: Expression;
  token: Token;
}

export interface SaveDeviceStmt {
  kind: "save-device";
  key: Expression;
  value: Expression;
  token: Token;
}

export interface LoadDeviceStmt {
  kind: "load-device";
  key: Expression;
  name: string;
  token: Token;
}

export interface DeleteDeviceStmt {
  kind: "delete-device";
  key: Expression;
  token: Token;
}

export interface GetDataStmt {
  kind: "get-data";
  url: Expression;
  name: string;
  token: Token;
}

export interface SendDataStmt {
  kind: "send-data";
  url: Expression;
  value: Expression;
  name: string;
  token: Token;
}

// --------------------------------------------------------------- app model

export interface AppStmt {
  kind: "app";
  name: string;
  pages: PageStmt[];
  token: Token;
}

export interface PageStmt {
  kind: "page";
  name: string;
  body: UiNode[];
  token: Token;
}

export interface UiNode {
  kind: "ui";
  /** Stable generated id used by the web runtime. */
  uid?: string;
  /** Canonical element name, such as "text area" or "navigation bar". */
  element: string;
  label?: Expression;
  id?: string;
  hint?: Expression;
  starting?: Expression;
  description?: Expression;
  choices: Expression[];
  showing?: Expression;
  columns: Expression[];
  minimum?: Expression;
  maximum?: Expression;
  width?: Expression;
  height?: Expression;
  level?: number;
  submits: boolean;
  required: boolean;
  linkTo?: Expression;
  /** Optional poster image for a video. */
  poster?: Expression;
  /** Loop a video or audio clip. */
  loop?: boolean;
  children: UiNode[];
  token: Token;
}

export interface StyleDecl {
  property: string;
  value: StyleValue;
  token: Token;
}

export type StyleValue =
  | { type: "number"; value: number }
  | { type: "percent"; value: number }
  | { type: "text"; value: string }
  | { type: "color"; value: string }
  | { type: "keyword"; value: string };

export interface StyleState {
  state: string;
  declarations: StyleDecl[];
  token: Token;
}

export interface StyleStmt {
  kind: "style";
  target: string;
  targetType: "everything" | "id" | "kind";
  media?: string;
  dark: boolean;
  declarations: StyleDecl[];
  states: StyleState[];
  token: Token;
}

export interface ThemeStmt {
  kind: "theme";
  name: string;
  dark: boolean;
  declarations: StyleDecl[];
  token: Token;
}

export type AppEvent =
  | { type: "click"; id: string }
  | { type: "change"; id: string }
  | { type: "typing"; id: string }
  | { type: "hover"; id: string }
  | { type: "mouse-enter"; id: string }
  | { type: "mouse-leave"; id: string }
  | { type: "key"; key: string }
  | { type: "page-open"; page?: string }
  | { type: "resize" }
  | { type: "submit"; id: string };

export interface WhenStmt {
  kind: "when";
  event: AppEvent;
  body: Statement[];
  token: Token;
}

export interface EveryStmt {
  kind: "every";
  seconds?: number;
  frame: boolean;
  body: Statement[];
  token: Token;
}

export interface ShowStmt {
  kind: "show";
  id: string;
  token: Token;
}

export interface HideStmt {
  kind: "hide";
  id: string;
  token: Token;
}

export interface ClearStmt {
  kind: "clear";
  id: string;
  token: Token;
}

export interface ChangeOfStmt {
  kind: "change-of";
  property: string;
  id: string;
  value: Expression;
  token: Token;
}

export interface GoToPageStmt {
  kind: "go-to-page";
  page: string;
  token: Token;
}

export interface PopupStmt {
  kind: "open-popup" | "close-popup";
  id: string;
  token: Token;
}

export interface PlaySoundStmt {
  kind: "play-sound";
  path: Expression;
  token: Token;
}

export interface ClearCanvasStmt {
  kind: "clear-canvas";
  id: string;
  color: string;
  token: Token;
}

export interface DrawStmt {
  kind: "draw";
  shape: "rectangle" | "circle" | "text" | "line" | "image";
  id: string;
  x?: Expression;
  y?: Expression;
  width?: Expression;
  height?: Expression;
  size?: Expression;
  color?: string;
  text?: Expression;
  fromX?: Expression;
  fromY?: Expression;
  toX?: Expression;
  toY?: Expression;
  path?: Expression;
  token: Token;
}
