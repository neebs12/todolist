const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
// const SessionPersistence = require("./lib/session-persistence");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");
const { ResultWithContext } = require("express-validator/src/chain");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

const requiresAuthentication = (req, res, next) => {
  let signedIn = req.session.signedIn;
  if (signedIn !== true) {
    // console.log("Unauthorised.");
    // res.status(401).send("Unauthorised."); // Note use of 401 and not 404 status code
    // redirection to the signin page
    // 302 response is typically defaulted. but  explicit here
    res.redirect(302, "/users/signin"); 
  } else {
    // as this callback will be put in the middleware chain in certain routes
    next(); 
  }
};

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000, // 31 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-todos-session-id",
  resave: false,
  saveUninitialized: true,
  secret: "this is not very secure",
  store: new LokiStore({}),
}));

app.use(flash());

app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  // res.locals.store = new SessionPersistence(req.session);
  next();
});

// Extract (relevant) session info, and shove them in res.locals to be accessible by views
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/lists");
});

// Render the list of todo lists
app.get("/lists", requiresAuthentication,
  catchError(async (req, res, next) => {
    let store = res.locals.store;
    let todoLists = await store.sortedTodoLists();

    let todosInfo = todoLists.map(todoList => ({
      countAllTodos: todoList.todos.length,
      countDoneTodos: todoList.todos.filter(todo => todo.length),
      isDone: store.isDoneTodoList(todoList),
    }));

    res.render("lists", {
      todoLists,
      todosInfo,
    });
  })
);

// Render new todo list page
app.get("/lists/new", 
  requiresAuthentication, 
  (req, res) => {
  res.render("new-list");
});

// Create a new todo list
app.post("/lists",
  requiresAuthentication,
  [
    body("todoListTitle")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The list title is required.")
      .isLength({ max: 100 })
      .withMessage("List title must be between 1 and 100 characters.")
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let todoListTitle = req.body.todoListTitle;

    const rerenderNewList = () => {
      res.render("new-list", {
        todoListTitle,
        flash: req.flash(),
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderNewList();
    } 
      else if (await res.locals.store.existsTodoListTitle(todoListTitle)) {
      req.flash("error", "The list title must be unique.");
      rerenderNewList();
    } 
    else {
      let created = await res.locals.store.createTodoList(todoListTitle);
      if (!created) {
        req.flash("error", "The list title must be unique.");
        rerenderNewList();
      } else {
        req.flash("success", "The todo list has been created.");
        res.redirect("/lists");
      }
    }
  })
);

// Render individual todo list and its todos
app.get("/lists/:todoListId", requiresAuthentication,
  catchError(async (req, res, next) => {
    let todoListId = req.params.todoListId;
    let todoList = await res.locals.store.loadTodoList(+todoListId);
    if (!todoList) throw new Error("Not Found.");

    todoList.todos = await res.locals.store.sortedTodos(todoList);

    res.render("list", {
      todoList, // to facilitate .title and .id and the iteration in pug
      isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
      hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
    });    
  }) 
);

// Toggle completion status of a todo
app.post("/lists/:todoListId/todos/:todoId/toggle", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let { todoListId, todoId } = { ...req.params };
    let toggled = await res.locals.store.toggleDoneTodo(+todoListId, +todoId);    
    if (!toggled) throw new Error("Not Found.");

    let todo = await res.locals.store.loadTodo(+todoListId, +todoId);
    if (todo.done) {
      req.flash("success", `"${todo.title}" marked done.`);
    } else {
      req.flash("success", `"${todo.title}" marked as NOT done!`);
    }
    res.redirect(`/lists/${todoListId}`);
  }),
);

app.post("/lists/:todoListId/todos/:todoId/destroy", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let { todoListId, todoId } = { ...req.params };
    let deleted = await res.locals.store.deleteTodo(+todoId);
    if (!deleted) throw new Error("Not Found.");
    req.flash("success", "The todo has been deleted.");
    res.redirect(`/lists/${todoListId}`);
  }), 
);

// Mark all todos as done
app.post("/lists/:todoListId/complete_all", 
  requiresAuthentication,
  catchError(async (req, res, next) => {
    let todoListId = req.params.todoListId;
    let completed = await res.locals.store.completeAllTodos(+todoListId);
    if (!completed) throw new Error("Not Found.");
    req.flash("success", "All todos have been marked as done.");
    res.redirect(`/lists/${todoListId}`);    
  })
);

app.post("/lists/:todoListId/todos", 
  requiresAuthentication,
  [
  body("todoTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The todo title is required.")
    .isLength({ max: 100 })
    .withMessage("Todo title must be between 1 and 100 characters."),  
  ],
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoTitle = req.body.todoTitle;
    let todoList = await res.locals.store.loadTodoList(+todoListId);
    if (!todoList) throw new Error("Not Found.");

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      todoList.todos = await res.locals.store.sortedTodos(todoList);

      res.render("list", {
        todoList, // to facilitate .title and .id and the iteration in pug
        isDoneTodoList: res.locals.store.isDoneTodoList(todoList),
        hasUndoneTodos: res.locals.store.hasUndoneTodos(todoList),
        todoTitle,
        flash: req.flash(),
      });      
    } else {
      let created = await res.locals.store.createTodo(+todoListId, todoTitle);
      if (!created) throw new Error("Not Found.");
      req.flash("success", "The todo has been created.");
      res.redirect(`/lists/${todoListId}`);      
    }
  }),
);

// Render edit todo list form
app.get("/lists/:todoListId/edit", 
  requiresAuthentication,
  catchError(async (req, res) => {
    let todoListId = req.params.todoListId;
    let todoList = await res.locals.store.loadTodoList(+todoListId);    
    if (!todoList) throw new Error("Not Found.");
    res.render("edit-list", { todoList });
  })
);

// Delete todo list
app.post("/lists/:todoListId/destroy", 
  requiresAuthentication,
  catchError( async (req, res) => {
    let todoListId = req.params.todoListId;
    let deleted = await res.locals.store.deleteTodoList(+todoListId);
    if (!deleted) throw new Error("Not Found.");
    req.flash("success", "Todo list deleted.");
    res.redirect("/lists");    
  })
);

// Edit todo list title
app.post("/lists/:todoListId/edit", 
  requiresAuthentication,
  [
    body("todoListTitle")
    .trim()
    .isLength({ min: 1 })
    .withMessage("The list title is required.")
    .isLength({ max: 100 })
    .withMessage("List title must be between 1 and 100 characters.")
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let todoListId = req.params.todoListId;
    let todoListTitle = req.body.todoListTitle;

    // LS extracted the redering functionality to the body of the middleware
    const rerenderEditList = async () => {
      let todoList = await store.loadTodoList(+todoListId);
      if (!todoList) throw new Error("Not found.");
      res.render("edit-list", {
        todoListTitle,
        todoList,
        flash: req.flash(),
      });
    };

    try {
      let errors = validationResult(req);
      if (!errors.isEmpty()) {
        errors.array().forEach(message => req.flash("error", message.msg));
        await rerenderEditList();
      } else if (await res.locals.store.existsTodoListTitle(todoListTitle)) {
        req.flash("error", "The list title must be unique.");
        await rerenderEditList();
      } else {
        let updated = await res.locals.store.setTodoListTitle(+todoListId,todoListTitle);
        if (!updated) throw new Error("Not found."); 

        req.flash("success", "Todo list updated.");
        res.redirect(`/lists/${todoListId}`);      
      }      
    } catch (error) {
      if (store.isUniqueConstraintViolation(error)) {
        req.flash("error", "The list title must be unique.");
        rerenderEditList();
      } else {
        throw error;
      }
    }


  })
);

// Intial Sign in Page
app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in");
  res.render("signin", {
    flash: req.flash(),
  });
});

// Sign in Page, submission of information to server.
app.post("/users/signin", async (req, res) => {
  let username = req.body.username.trim();
  let password = req.body.password;
  // this is not a sign up
  let userExists = await res.locals.store.authenticate(username, password);
  if (!userExists) {
    req.flash("error", "Invalid Credentials");
    res.render("signin", {
      flash: req.flash(),
      username,
    });
  } else {
    req.session.username = username; // stored in sessions for API
    req.session.signedIn = true; // this is the variable to be scrutinized
    req.flash("success", "Welcome!");
    res.redirect("/lists");
  }
});

app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect("/users/signin");
});

// Error handler
app.use((err, req, res, _next) => {
  console.log(err); // Writes more extensive information to the console log
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Todos is listening on port ${port} of ${host}!`);
});
