/** One short English sentence describing what a statement does. */
export function explainStatement(statement) {
    switch (statement.kind) {
        case "say":
            return "show a value in the terminal.";
        case "ask":
            return `ask a question and save the answer as "${statement.name}".`;
        case "set":
            return `store a value${named(statement.target)}.`;
        case "change":
            return `update a value${named(statement.target)}.`;
        case "add":
            return `add to a value${named(statement.target)}.`;
        case "remove":
            return `remove from a value${named(statement.target)}.`;
        case "if":
            return "choose which branch should run.";
        case "repeat":
            return "run a block a fixed number of times.";
        case "for-each":
            return `visit every item and call each one "${statement.name}".`;
        case "count":
            return `count from one value to another using "${statement.name}".`;
        case "while":
            return "repeat while the condition stays true.";
        case "stop":
            return "leave the nearest loop now.";
        case "skip":
            return "skip to the next turn of the loop.";
        case "define":
            return `define the function "${statement.name}".`;
        case "give-back":
            return "return a value from a function.";
        case "try":
            return "try some steps and handle a failure.";
        case "use":
            return statement.isPath ? `load the file "${statement.target}".` : `make "${statement.target}" available.`;
        case "state":
            return `keep track of "${statement.name}" so the screen can refresh.`;
        case "call-stmt":
            return `call the function "${statement.name}".`;
        case "call-value-stmt":
            return "call a function value.";
        case "method-stmt":
            return `ask "${statement.object}" to run "${statement.method}".`;
        case "sort":
            return "sort a list.";
        case "reverse":
            return "reverse a list.";
        case "shuffle":
            return "shuffle a list into a random order.";
        case "kind":
            return `define a kind of thing called "${statement.name}".`;
        case "read-file":
            return `read a project file into "${statement.name}".`;
        case "write-file":
            return "write text to a project file.";
        case "delete-file":
            return "delete a project file.";
        case "list-files":
            return `list project files into "${statement.name}".`;
        case "wait":
            return "pause for a moment.";
        case "save-device":
            return "save a value on this device.";
        case "load-device":
            return `load a saved value into "${statement.name}".`;
        case "delete-device":
            return "remove a saved value from this device.";
        case "get-data":
            return `fetch web data into "${statement.name}".`;
        case "send-data":
            return "send data to a web address.";
        case "app":
            return `describe the app "${statement.name}".`;
        case "style":
            return "change how part of the app looks.";
        case "theme":
            return `name a set of colours and fonts for "${statement.name}".`;
        case "when":
            return "do something when the visitor acts.";
        case "every":
            return "do something on a timer.";
        case "show":
            return "show part of the page.";
        case "hide":
            return "hide part of the page.";
        case "clear":
            return "clear a list, canvas, or value.";
        case "change-of":
            return "change part of a page element.";
        case "go-to-page":
            return "move to another page.";
        case "open-popup":
            return "open a dialog.";
        case "close-popup":
            return "close a dialog.";
        case "play-sound":
            return "play a sound.";
        case "clear-canvas":
            return "clear a drawing surface.";
        case "draw":
            return "draw a shape or text.";
        default:
            return "run this step.";
    }
}
function named(target) {
    if (target.kind === "variable")
        return ` in "${target.name}"`;
    if (target.kind === "property") {
        const key = target.key;
        return ` in "${key}"`;
    }
    return "";
}
//# sourceMappingURL=explain.js.map