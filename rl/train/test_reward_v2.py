import unittest
from reward_v2 import score_first_step, valid, SCHEMAS

class RewardTests(unittest.TestCase):
    def test_reward_hacking(self):
        import json
        def output(name, args):
            return '<think>x</think><tool_call>'+json.dumps(dict(name=name,arguments=args))+'</tool_call>'
        def score(name, args):
            return score_first_step(output(name,args),'explicit_wait','','get_wait_times',{'park_id':'shanghai','ride_id':'tron'})
        self.assertEqual(score('get_wait_times',{'park_id':'shanghai','ride_id':'tron'}),1)
        self.assertLess(score('get_wait_times',{'park_id':'shanghai','ride_id':'pirates'}),1)
        self.assertEqual(score('made_up',{}),0)
        self.assertEqual(score('get_wait_times',{'park_id':None}),0)
        self.assertEqual(score('get_weather',{'park_id':'shanghai'}),0.1)
        self.assertEqual(score('get_wait_times',{'park_id':'shanghai','typo':1}),0)
    def test_schema(self):
        s=SCHEMAS['search_reviews']
        good=dict(park_id='shanghai',target_id='tron',target_type='ride',query='好玩吗')
        self.assertTrue(valid(good,s))
        for k,v in [('target_type','hotel'),('top_k',0),('top_k',1.5),('top_k',True),('top_k',21),('query','')]:
            self.assertFalse(valid(dict(good,**{k:v}),s))
