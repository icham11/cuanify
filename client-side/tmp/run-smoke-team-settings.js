/* eslint-disable @typescript-eslint/no-require-imports */
const { runRegressionSmokeSuite } = require("./run-regression-smoke-suite");

runRegressionSmokeSuite({ domains: ["team-settings"] })
  .then(({ pass, summary }) => {
    console.log(JSON.stringify({ pass, summary }, null, 2));
    if (!pass) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.log(
      JSON.stringify(
        {
          pass: false,
          summary: {
            domains: ["team-settings"],
            errors: [error instanceof Error ? error.message : String(error)],
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
