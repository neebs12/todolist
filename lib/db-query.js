const { Client } = require("pg");
const credentials = require("db-query-credentials");
const CLIENT_INPUT = {
  database: "todo-lists",
  username: credentials.username,
  password: credentials.password      
};

// this is automatically run in the invocation of bdQuery by an external function
const logQuery = (statement, parameters) => {
  let timeStamp = new Date();
  let formattedTimeStamp = timeStamp.toString().substring(4, 24);
  console.log(formattedTimeStamp, statement, parameters);  
}

module.exports = {
  async dbQuery(statement, ...parameters) {
    // rest syntax (...parameters) are for gathering multiple parameters into a singular variable
    let client = new Client(CLIENT_INPUT);

    await client.connect();
    logQuery(statement, parameters);
    let result = await client.query(statement, parameters);
    await client.end();

    return result;
  }
};