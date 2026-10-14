"""Acceptance checks for release promotion; only mutates a temporary copy."""
from pathlib import Path
import json, shutil, subprocess, tempfile, unittest
BASE=Path(__file__).resolve().parents[1]
class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.base=Path(self.temp.name)/'app'
        shutil.copytree(BASE,self.base,ignore=shutil.ignore_patterns('__pycache__'))
        self.test=json.loads((self.base/'channels/test.json').read_text())
        self.production=json.loads((self.base/'channels/production.json').read_text())
        self.next_sequence=str(self.production['sequence']+1)
    def tearDown(self):self.temp.cleanup()
    def run_tool(self,*args):
        return subprocess.run(['python3',str(self.base/'tools/release.py'),*args],capture_output=True,text=True)
    def test_promotion_uses_identical_bytes_and_does_not_change_test(self):
        before=(self.base/self.test['path']).read_bytes()
        self.assertEqual(self.run_tool('promote','--sequence',self.next_sequence,'--accepted-sha256',self.test['sha256']).returncode,0)
        production=json.loads((self.base/'channels/production.json').read_text())
        self.assertEqual(production['sha256'],self.test['sha256']);self.assertEqual(production['path'],self.test['path'])
        self.assertEqual(production['channel'],'production');self.assertEqual(before,(self.base/production['path']).read_bytes())
        self.assertEqual(self.test,json.loads((self.base/'channels/test.json').read_text()))
    def test_changed_candidate_is_refused(self):
        before=(self.base/'channels/production.json').read_bytes()
        self.assertNotEqual(self.run_tool('promote','--sequence',self.next_sequence,'--accepted-sha256','0'*64).returncode,0)
        self.assertEqual(before,(self.base/'channels/production.json').read_bytes())
    def test_corrupt_artifact_is_refused(self):
        (self.base/self.test['path']).write_text('corrupt')
        self.assertNotEqual(self.run_tool('promote','--sequence',self.next_sequence,'--accepted-sha256',self.test['sha256']).returncode,0)
    def test_reused_production_sequence_is_refused(self):
        self.assertNotEqual(self.run_tool('promote','--sequence',str(self.production['sequence']),'--accepted-sha256',self.test['sha256']).returncode,0)
    def test_reused_candidate_sequence_is_refused(self):
        self.assertNotEqual(self.run_tool('candidate','--sequence',str(self.test['sequence'])).returncode,0)
    def test_configuration_generates_matching_channel_launchers(self):
        for name,channel in [('Wake_Window','production'),('Wake_Window_Test','test')]:
            content=(self.base/'launchers'/f'{name}.js').read_text()
            self.assertEqual(content,(self.base/'launchers'/f'{name}.txt').read_text())
            self.assertIn('"channel": "'+channel+'"',content)
            self.assertIn('"repository": "LearningCodeHard/Wake-Window-Tracker"',content)
            self.assertIn('"downloadMode": "public"',content)
if __name__=='__main__':unittest.main()
