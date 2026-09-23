#!/usr/bin/env python3
"""Unit tests for the deterministic router (plan §12).

    python3 .claude/skills/pr-self-review/scripts/test_collect.py
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import collect

ROUTING = json.loads((Path(collect.SKILL_DIR) / "routing.json").read_text(encoding="utf-8"))


class TestMatches(unittest.TestCase):
    def test_double_star_matches_any_depth(self):
        self.assertTrue(collect.matches("client/src/app/page.tsx", ["client/src/**"]))
        self.assertTrue(collect.matches("x.ts", ["**/*.ts"]))
        self.assertFalse(collect.matches("server/src/app.ts", ["client/src/**"]))


class TestRouting(unittest.TestCase):
    def route(self, files):
        return collect.route(files, ROUTING)

    def test_client_and_server_files_pull_both_skill_sets(self):
        skills, _ = self.route(["client/src/app/skills/page.tsx", "server/src/modules/skills/http/routes.ts"])
        self.assertIn("react-best-practices", skills)
        self.assertIn("frontend-ui-architecture", skills)
        self.assertIn("next-best-practices", skills)
        self.assertIn("onion-architecture", skills)
        self.assertIn("fastify-best-practices", skills)
        self.assertEqual(skills["onion-architecture"], ["server/src/modules/skills/http/routes.ts"])

    def test_db_files_go_to_the_data_skills(self):
        skills, _ = self.route(["server/src/db/schema/skills.ts"])
        self.assertIn("drizzle-orm-patterns", skills)
        self.assertIn("postgresql-table-design", skills)
        self.assertNotIn("react-best-practices", skills)

    def test_excluded_paths_are_skipped_not_reviewed(self):
        skills, skipped = self.route(["design/mock.html", "server/clones/x/src/a.ts", "client/INSIGHTS.md"])
        self.assertEqual(skills, {})
        self.assertEqual(len(skipped), 3)

    def test_tests_route_to_the_testing_skill(self):
        skills, _ = self.route(["client/src/app/skills/_components/SkillCard/SkillCard.test.tsx"])
        self.assertIn("react-testing-library", skills)

    def test_vendored_client_copy_is_not_reviewed_as_app_code(self):
        skills, _ = self.route(["client/src/vendor/ui/kit/Modal.tsx"])
        self.assertNotIn("react-best-practices", skills)


class TestGates(unittest.TestCase):
    def test_schema_change_without_migration_is_a_gate(self):
        gates = collect.gates_for(["server"], ["server/src/db/schema/knowledge.ts"], ROUTING)
        self.assertIn("server:missing-migration", gates)

    def test_schema_change_with_migration_is_clean(self):
        gates = collect.gates_for(
            ["server"],
            ["server/src/db/schema/knowledge.ts", "server/src/db/migrations/0013_x.sql"],
            ROUTING,
        )
        self.assertNotIn("server:missing-migration", gates)

    def test_shared_contract_change_runs_the_drift_check(self):
        gates = collect.gates_for(["server"], ["server/src/vendor/shared/contracts/knowledge.ts"], ROUTING)
        self.assertIn("repo:check-shared-drift", gates)

    def test_server_change_runs_arch_check_and_package_gates(self):
        gates = collect.gates_for(["server"], ["server/src/modules/a/service.ts"], ROUTING)
        self.assertIn("server:arch:check", gates)
        self.assertIn("server:typecheck", gates)
        self.assertIn("server:lint", gates)


class TestUnroutedSkills(unittest.TestCase):
    def test_every_installed_skill_is_routed_or_explicitly_excluded(self):
        # A new skill must be added to routing.json (or to no_review), or it
        # would silently never review anything.
        self.assertEqual(collect.unrouted({}, ROUTING), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
