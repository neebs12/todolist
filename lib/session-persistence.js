const SeedData = require("./seed-data");
const deepCopy = require("./deep-copy");
const { sortTodoLists, sortTodos } =  require("./sort");
const nextId = require("./next-id");
const { redirect } = require("express/lib/response");

module.exports = class SessionPersistence {
  constructor(session) {
    this._todoLists = session.todoLists || deepCopy(SeedData);
    session.todoLists = this._todoLists; // used with deepCopy(SeedData)
  }

  _restoreData(session) { /*This is for personal testing only!*/
    this._todoLists = deepCopy(SeedData);
    session.todoLists = this._todoLists;
  }

  // Returns `true` if `error` seems to indicate a `UNIQUE` constraint
  // violation, `false` otherwise.
  isUniqueConstraintViolation(_error) {
    return false;
  }  

  // Are all of the todos in the todo list done? If the todo list has at least one todo and all of its todos are marked as done, then the todo list is done. Otherwise, it is undone.
  // Main purpose of isDoneTodoList here is to separate session-pers logic from application logic
  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && todoList.todos.every(todo => todo.done);
  }  

  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  isDoneTodo(todo) {
    return todo.done;
  }

  // Returns a copy of the list of todo lists sorted by completion status and title (case-insensitive).
  sortedTodoLists() {
    let todoLists = deepCopy(this._todoLists);
    // these are ALL new arrays (not tied to the originals)
    let undone = todoLists.filter(todoList => !this.isDoneTodoList(todoList));
    let done = todoLists.filter(todoList => this.isDoneTodoList(todoList));
    return sortTodoLists(undone, done);
  }

  sortedTodos(todoList) {
    let todos = todoList.todos;
    let undone = todos.filter(todo => !todo.done);
    let done = todos.filter(todo => todo.done);

    return deepCopy(sortTodos(undone, done));
  }

  // T7 - moving load TodoList in to Session-Persistence Class
  // Side note: due to implementation in line res.locals.store = new SessionPersistence(req.session), any instance methods defined here will be accessible in the main application js file.
  // so assuming that we are simply reflecting the functionality from the main application, 
  // the original functionality appears to be that it takes in a todoListID which then returns the appropriate todoList that contains todo. This the todoListID function is 'queried' against the instance' this._todoLists. Which contains an array of todoLists.
  loadTodoList(todoListID) {
    // deep copy to ensure that even returned objects are not of the the same referenced as that of the sub objects this._todoLists
    // let todoLists = deepCopy(this._todoLists);
    // // due to deep copy, the 'found' todoList will not share >any objects - only information about it.
    // return todoLists.find(todoList => todoList.id === todoListID);
    return deepCopy(this._findTodoList(todoListID));
  }

  // Find a todo with the indicated ID in the indicated todo list. Returns
  // `undefined` if not found. Note that both `todoListId` and `todoId` must be
  // numeric.
  loadTodo(todoListID, todoID) {
    // we have a list of todoLists in this._todoLists
    // let todoList = this.loadTodoList(todoListID);
    // if (!todoList) return undefined;
    // // double deep copied - inefficient but more readable
    // return deepCopy(todoList.todos.find(todo => todo.id === todoID));
    return deepCopy(this._findTodo(todoListID, todoID));
  }

  // 
  toggleDoneTodo(todoListID, todoID) {
    let todo = this._findTodo(todoListID, todoID);
    if (!todo) return false; // not found

    todo.done = !todo.done; // inversion
    return true;
  }

  deleteTodo(todoListID, todoID) {
    // LS chooses to have the function mutate and be a predicate
    let todoList = this._findTodoList(todoListID); // non-copy object
    if (!todoList) return false;
    // todoList.todos gives the array of todos. 
    // we need to find the index of the todo to be removed
    // identifies `same` object
    let ind = todoList.todos.findIndex(todo => todo.id === todoID);
    if (ind === -1) return false; 

    todoList.todos.splice(ind, 1) // LS clever replacement to long concat code
    // todoList.todos = [].concat(
    //   todoList.todos.slice(0, ind), todoList.todos.slice(ind+1));
    return true;
  }

  completeAllTodos(todoListID) {
    let todoList = this._findTodoList(todoListID); // non-copy object
    if (!todoList) return false;

    todoList.todos.forEach(todo => {todo.done = true}); // mutating
    return true;
  }

  createATodo(todoListID, todoTitle) {
    let todoList = this._findTodoList(todoListID); // non-copy object
    if (!todoList) return false;

    todoList.todos.push({
      id: nextId(),
      title: todoTitle,
      done: false,
    });
    return true;
  }

  createATodoList(todoListTitle) {
    this._todoLists.push({
      id: nextId(),
      title: todoListTitle,
      todos: [],
    });
    return true;
  }

  deleteTodoList(todoListId) {
    // mutates this._todoLists, 
    // returns true or false depending if operation is successful or not
    let todoList = this._findTodoList(todoListId);
    if (!todoList) return false; // not a valid id
    // then mutate this._todoLists to splice out the matching todoList
    let ind = this._todoLists.findIndex(td => td.id === todoListId);
    this._todoLists.splice(ind, 1);
    return true;
  }

  setTodoListTitle(todoListID, todoListTitle) {
    let todoList = this._findTodoList(todoListID); // is a non-copy
    if (!todoList) return false; // not a valid id

    // mutate object
    todoList.title = todoListTitle;
    return true;
  }

  existsTodoListTitle(title) {
    return this._todoLists.some(todoList => todoList.title === title);
  }

  // Private and non-deep copied object return (todo)
  _findTodo(todoListID, todoID) {
    let todoList = this._findTodoList(todoListID);
    if (!todoList) return undefined;
    return todoList.todos.find(todo => todo.id === todoID);
  }

  // Private and non-deep copied object return (todoList)
  _findTodoList(todoListID) {
    let todoList = this._todoLists.find(todoList => todoList.id === todoListID);
    if (!todoList) return undefined
    return todoList;
  }
};