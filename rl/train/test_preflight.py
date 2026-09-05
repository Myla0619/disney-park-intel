import unittest
from preflight import audit

class PreflightTests(unittest.TestCase):
    def row(self):
        return dict(prompt=[dict(role='system',content='<tool_call> search_reviews'),dict(role='user',content='排队多久')],category='explicit_wait',ref_tool_name='get_wait_times',ref_tool_args={'park_id':'shanghai'})
    def test_valid(self): self.assertEqual(audit([self.row()]),[])
    def test_duplicates(self): self.assertTrue(audit([self.row(),self.row()]))
    def test_missing_label(self):
        r=self.row();r.pop('ref_tool_args');self.assertTrue(audit([r]))
    def test_assistant_prefill(self):
        r=self.row();r['prompt'].append(dict(role='assistant',content='<tool_response>'));self.assertTrue(audit([r]))
