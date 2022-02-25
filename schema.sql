\! echo "~~~FROM: schema.sql~~~"
-- Database is 'todo-lists'
CREATE TABLE todolists (
  id serial PRIMARY KEY, --
  username text NOT NULL, -- No unique constraint, multiple todo lists for each user
  title text NOT NULL UNIQUE -- 
);

CREATE TABLE todos (
  id serial PRIMARY KEY,
  username text NOT NULL, -- No unique constraint here, multiple todos for each user
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  todolist_id integer 
    NOT NULL 
    REFERENCES todolists (id)
    ON DELETE CASCADE
);

CREATE TABLE users (
  username text PRIMARY KEY,
  password text NOT NULL
);