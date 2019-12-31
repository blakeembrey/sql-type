import { Table, Column, DefaultColumn } from "./index";

describe("sql type", () => {
  describe("table", () => {
    const table = new Table("users", {
      id: new DefaultColumn<string>("id"),
      username: new Column<string>("username"),
      createdAt: new DefaultColumn<Date>("created_at")
    });

    it("should generate an insert statement", () => {
      const sql = table.create({ username: "test" });

      expect(sql.text).toEqual(
        "INSERT INTO users (id,username,created_at) VALUES ($1,$2,$3)"
      );
      expect(sql.values).toEqual([undefined, "test", undefined]);
    });
  });
});
