const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");

module.exports = class PgPersistence {
  // comment out or delete all remaining method bodies

  constructor(session) {
    this.username = session.username;
  }

  // Mark all todos on the todo list as done. Returns `true` on success,
  // `false` if the todo list doesn't exist. The todo list ID must be numeric.
  async completeAllTodos(todoListId) {
    let UPDATE_TODOS = "UPDATE todos SET done = TRUE " + 
                       "  WHERE todolist_id = $1" + 
                       "    AND username = $2";
    let result = await dbQuery(UPDATE_TODOS, todoListId, this.username);
    return result.rowCount > 0;
  }

  // Create a new todo list with the specified title and add it to the list of
  // todo lists. Returns `true` on success, `false` on failure. (At this time,
  // there are no known failure conditions.)
  async createTodoList(title) {
    // Insert into a new todolist in to the todolists table
    // Due to schema, the unique constraint will insertion of existing title
    let INSERT_TODOLIST = "INSERT INTO todolists (title, username)"+
                          "  VALUES ($1, $2)";
    try {
      let result = await dbQuery(INSERT_TODOLIST, title, this.username);
      return result.rowCount > 0;
    } catch (error) {
      // if the specific error is unique constraint 'triggered', then the function will simply return false. Outside the function, this triggers the unique flash message. This allows for distinction between a 'unique' error, and another error.
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error; // this wil be caught by the catchError from the greater function
    }
  }

  // Create a new todo with the specified title and add it to the indicated todo
  // list. Returns `true` on success, `false` on failure.
  async createTodo(todoListId, title) {
    // let UPDATE_TODO = "UPDATE todos SET title = $2 WHERE id = $1";
    let INSERT_TODO = "INSERT INTO todos (todolist_id, title, username)"+
                      "  VALUES ($1, $2, $3);";

    let result = await dbQuery(INSERT_TODO, todoListId, title, this.username);
    return result.rowCount > 0;
  }

  // Delete a todo list from the list of todo lists. Returns `true` on success,
  // `false` if the todo list doesn't exist. The ID argument must be numeric.
  async deleteTodoList(todoListId) {
    let DELETE_TODOLIST = "DELETE FROM todolists "+
                          "  WHERE id = $1 AND username = $2;";
    let resultTodolist = await dbQuery(DELETE_TODOLIST, todoListId, this.username);
    // Following lines not required due to 'ON DELETE CASCADE' constraint todos schema
    // let DELETE_TODOS = "DELETE FROM todos WHERE todolist_id = $1";
    // let resultTodos = await dbQuery(DELETE_TODOS, todoListId);

    return resultTodolist.rowCount > 0;
  }

  // Delete the specified todo from the specified todo list. Returns `true` on
  // success, `false` if the todo or todo list doesn't exist. The id arguments
  // must both be numeric.
  async deleteTodo(todoId) {
    let DELETE_TODO = "DELETE FROM todos "+
                      "  WHERE id = $1 AND username = $2;";
    let result = await dbQuery(DELETE_TODO, todoId, this.username);
    return result.rowCount > 0;    
  }

  // Does the todo list have any undone todos? Returns true if yes, false if no.
  hasUndoneTodos(todoList) {
    return todoList.todos.some(todo => !todo.done);
  }

  // Are all of the todos in the todo list done? If the todo list has at least one todo and all of its todos are marked as done, then the todo list is done. Otherwise, it is undone.
  isDoneTodoList(todoList) {
    return todoList.todos.length > 0 && 
      todoList.todos.every(todo => todo.done);
  }

  // Returns a Promise that resolves to `true` if a todo list with the specified
  // title exists in the list of todo lists, `false` otherwise.
  async existsTodoListTitle(title) {
    const COUNT_TODOLIST_TITLE = "SELECT * FROM todolists " + 
                                 "  WHERE title = $1 AND username = $2;";
    let result = await dbQuery(COUNT_TODOLIST_TITLE, title, this.username);
    // if a row exists in the todolists table where the title is matching, then rowCount will be more than 0. If it is 0, there is no match.
    return result.rowCount > 0;
  }

  // Returns a copy of the todo list with the indicated ID. Returns `undefined`
  // if not found. Note that `todoListId` must be numeric.
  // Promise resolved to `undefined` if the todo is not found
  async loadTodoList(todoListId) {
    const LOAD_TODOLIST = "SELECT * FROM todolists" +
                          "  WHERE id = $1 AND username = $2";
    const FIND_TODOS = "SELECT * FROM todos" + 
                       "  WHERE todolist_id = $1 AND username = $2";
    
    // both initial dbQuery calls return a promise. These are passed to the Promise.all method invocation as a singular array. This returns a promise which then must be resolved prior to being assigned to the resultBoth variable due to the await keyword. The resolved value is then assigned to the resultBoth variable.
    let resultTodoList = dbQuery(LOAD_TODOLIST, todoListId, this.username);
    let resultTodos = dbQuery(FIND_TODOS, todoListId, this.username);
    let resultBoth = await Promise.all([resultTodoList, resultTodos]);
    
    let todoList = resultBoth[0].rows[0];
    if (!todoList) return undefined;

    let todos = resultBoth[1].rows;
    todoList.todos = todos;
    return todoList;
  }

  // Returns a copy of the indicated todo in the indicated todo list. Returns
  // `undefined` if either the todo list or the todo is not found. Note that
  // both IDs must be numeric.
  async loadTodo(todoListId, todoId) {
    const FIND_TODO = "SELECT * FROM todos" + 
                      " WHERE todolist_id = $1 AND id = $2 AND username = $3";

    let result = await dbQuery(FIND_TODO, todoListId, todoId, this.username);
    return result.rows[0];
  }

  // Set a new title for the specified todo list. Returns `true` on success,
  // `false` if the todo list isn't found. The todo list ID must be numeric.
  async setTodoListTitle(todoListId, title) {
    const UPDATE_TODOLIST = "UPDATE todolists" + 
                            "  SET title = $2" + 
                            "  WHERE id = $1 AND username = $3";
    let result = await dbQuery(UPDATE_TODOLIST, todoListId, title, this.username);
    // if rowCount is 0, then there is no update, otherwise OK
    return result.rowCount > 0;
  }

  // Returns a copy of the list of todo lists sorted by completion status and
  // title (case-insensitive).
  async sortedTodoLists() {
    const ALL_TODOLISTS = "SELECT * FROM todolists" +
                          "  WHERE username = $1" +
                          "  ORDER BY lower(title) ASC";
    const ALL_TODOS =     "SELECT * FROM todos" +
                          "  WHERE username = $1";
  
    let resultTodoLists = dbQuery(ALL_TODOLISTS, this.username);
    let resultTodos = dbQuery(ALL_TODOS, this.username);
    let resultBoth = await Promise.all([resultTodoLists, resultTodos]);
  
    let allTodoLists = resultBoth[0].rows;
    let allTodos = resultBoth[1].rows;
    if (!allTodoLists || !allTodos) return undefined;
  
    allTodoLists.forEach(todoList => {
      todoList.todos = allTodos.filter(todo => {
        return todoList.id === todo.todolist_id;
      });
    });
  
    return this._partitionTodoLists(allTodoLists);
  }

  _partitionTodoLists(todoLists) {
    let undone = [];
    let done = [];

    todoLists.forEach(todoList => {
      if (this.isDoneTodoList(todoList)) {
        done.push(todoList);
      } else {
        undone.push(todoList);
      }
    });

    return undone.concat(done);
  }

  // Returns a copy of the list of todos in the indicated todo list by sorted by
  // completion status(undone then done) then title (case-insensitive).
  async sortedTodos(todoList) {
    let todoListId = todoList.id;
    // LS Query: Specially note the section where the ORDER BY is double ordered!
    let SORTED_TODOS = "SELECT * FROM todos" +
                       "  WHERE todolist_id = $1 AND username = $2" +
                       "  ORDER BY done ASC, lower(title) ASC;";

    let result = await dbQuery(SORTED_TODOS, todoListId, this.username);
    return result.rows;
  }

  // Toggle a todo between the done and not done state. Returns a promise that
  // resolves to `true` on success, `false` if the todo list or todo doesn't
  // exist. The id arguments must both be numeric.
  async toggleDoneTodo(todoListId, todoId) {
    const TOGGLE_DONE = "UPDATE todos SET done = NOT done" +
                        "  WHERE todolist_id = $1" + 
                        "  AND id = $2" + 
                        "  AND username = $3";

    let result = await dbQuery(TOGGLE_DONE, todoListId, todoId, this.username);
    return result.rowCount > 0;
  }

  // Returns `true` if `error` seems to indicate a `UNIQUE` constraint
  // violation, `false` otherwise.
  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

  async authenticate(username, password) {
    let FIND_HASHED_PASSWORD = "SELECT password FROM users" + 
                               "  WHERE username = $1";
    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false; // Password not found

    return bcrypt.compare(password, result.rows[0].password);
  }
};