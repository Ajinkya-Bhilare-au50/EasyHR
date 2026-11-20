"""Tenant isolation regression test. Run against a seeded DB with the API on :8000:

    python tests/test_tenant_isolation.py
"""
import http.cookiejar
import json
import urllib.request

BASE = "http://localhost:8000/api"


def session():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(s, method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"content-type": "application/json"})
    try:
        with s.open(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def login(ws, login_, pw):
    s = session()
    status, _ = call(s, "POST", "/auth/login", {"workspace": ws, "login": login_, "password": pw})
    assert status == 200, (ws, login_, status)
    return s


def main():
    master = login("admin", "admin@easyhr.app", "Admin@12345")
    status, companies = call(master, "GET", "/master/companies")
    if not any(c["subdomain"] == "globex" for c in companies["items"]):
        call(master, "POST", "/master/companies", {"name": "Globex", "subdomain": "globex", "adminName": "Gina Lee",
                                                 "adminEmail": "gina@globex.example.com", "adminPassword": "Password@123"})
    alphabet = login("alphabet-inc", "kavya@alphabet.example.com", "Password@123")
    globex = login("globex", "1001", "Password@123")
    for _ in range(3):  # alternate requests so any cached tenant filter would show up
        a = {e["email"] for e in call(alphabet, "GET", "/admin/employees")[1]["items"]}
        g = {e["email"] for e in call(globex, "GET", "/admin/employees")[1]["items"]}
        assert a and g and not (a & g), (a, g)
        assert all(x.endswith("@alphabet.example.com") for x in a)
        assert g == {"gina@globex.example.com"}, g
        assert call(globex, "GET", "/profile/2140")[0] == 404
        assert call(globex, "GET", "/holidays")[0] == 200
    print("tenant isolation OK")


if __name__ == "__main__":
    main()
