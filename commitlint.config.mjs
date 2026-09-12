export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["api", "web", "db", "auth", "search", "ai", "chat", "reminders", "alerts", "docker", "ci", "deps", "repo"],
    ],
  },
};
