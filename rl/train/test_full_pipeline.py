import asyncio
import copy
import json
import unittest
from unittest.mock import patch
from park_agent_loop import run_multiturn, post_json
from prepare_full_sft import prepare


class CharacterAdapter:
    """Transport test adapter, not a trained model; each code point stands in for a token."""
    def __init__(self, outputs): self.outputs=iter(outputs);self.seen=[]
    async def initial(self,messages): return [1,2]
    async def generate(self,ids,params):self.seen.append(ids[:]);return next(self.outputs)
    def decode(self,output):return output
    async def assistant(self,ids,out,mask,probs):
        tokens=list(map(ord,out));return ids+tokens,mask+[1]*len(tokens),None
    async def observation(self,previous,updated,ids,mask,probs):
        tokens=list(map(ord,updated[-1]['content']));return ids+tokens,mask+[0]*len(tokens),None


class FullPipelineTests(unittest.TestCase):
    def task(self):return dict(id='seed',familyId='seed',split='train',parkId='shanghai',category='explicit_wait',query='创极速光轮现在排多久？',profile={},source='template',difficultyHint='easy')
    def test_real_http_multiturn_observations_are_not_policy_tokens(self):
        import os
        url=os.environ.get('PARK_TEST_ENV_URL')
        if not url:self.skipTest('set PARK_TEST_ENV_URL for real sandbox integration')
        task=self.task()
        messages=post_json(url,'/prompt',task)['messages']
        llm=CharacterAdapter(['<think>查询排队</think><tool_call>{"name":"get_wait_times","arguments":{"park_id":"shanghai","ride_id":"tron"}}</tool_call>',
                              '<think>数据足够</think><answer>回放数据中创极速光轮排队为75分钟；这是沙箱快照，不代表当前现场。</answer>'])
        result=asyncio.run(run_multiturn(llm,task,messages,{},12000,url))
        self.assertEqual(result['stopped'],'answer')
        self.assertEqual(result['calls'],1)
        self.assertEqual(result['mask'].count(1),sum(len(m['content']) for m in result['messages'] if m['role']=='assistant'))
        self.assertIn(0,result['mask'])
        self.assertIn('75',result['messages'][3]['content'])
        self.assertGreater(result['score'],0)
        self.assertEqual(len(llm.seen),2)
    def test_truncation_does_not_get_complete_answer_credit(self):
        llm=CharacterAdapter(['<think>查询排队</think><tool_call>{"name":"get_wait_times","arguments":{}}</tool_call>'])
        with patch('park_agent_loop.post_json',return_value={'done':False,'parsed':{'toolCall':{'name':'get_wait_times'}},'response':'x'*200}):
            r=asyncio.run(run_multiturn(llm,self.task(),[],{},100,'unused'))
        self.assertEqual(r['score'],0)
        self.assertEqual(r['stopped'],'context_budget')
        self.assertNotIn('x'*200,[m['content'] for m in r['messages']])
    def test_reward_infrastructure_failure_is_not_zero_reward(self):
        llm=CharacterAdapter(['<answer>完成</answer>'])
        with patch('park_agent_loop.post_json',side_effect=[{'done':True},{'ok':False}]):
            with self.assertRaises(RuntimeError):asyncio.run(run_multiturn(llm,self.task(),[],{},100,'unused'))
    def test_full_sft_materialized_weights_and_split_isolation(self):
        seeds=[{'id':'a','split':'train'},{'id':'b','split':'train'},{'id':'c','split':'validation'},{'id':'d','split':'test'}]
        def row(i,quality):return dict(taskId=i+'-v1',quality=quality,weight=1.0 if quality=='pass' else .6,difficulty='easy',category='explicit_wait',messages=[{'role':'assistant','content':'<answer>回答</answer>'}])
        stages,buckets=prepare([row('a','pass'),row('b','borderline'),row('c','pass'),row('d','pass')],seeds)
        for stage,counts in [('early',(10,3)),('mid',(20,9)),('late',(5,3))]:
            self.assertEqual(sum(r['taskId']=='a-v1' for r in stages[stage]),counts[0])
            self.assertEqual(sum(r['taskId']=='b-v1' for r in stages[stage]),counts[1])
            self.assertFalse(any(r['taskId'] in ('c-v1','d-v1') for r in stages[stage]))
    def test_unknown_family_fails(self):
        with self.assertRaises(ValueError):prepare([dict(taskId='z',weight=1,difficulty='easy',category='x',quality='pass',messages=[])],[{'id':'a','split':'train'}])


if __name__=='__main__':unittest.main()
