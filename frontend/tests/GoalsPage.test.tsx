import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,test,expect,vi} from 'vitest';
import {App} from '../src/App';
import {resetCsrfTokenCacheForTests} from '../src/api/client';
const goal={id:'g1',name:'Emergency',targetCents:10000,savingsAccountId:'a1',deadline:null,status:'active',revision:2,progressCents:12000,percentage:100,surplusCents:2000,asOfDate:'2026-10-04'};
function response(data:unknown){return new Response(JSON.stringify({data,...(Array.isArray(data)?{meta:{page:1,pageSize:50,total:data.length,totalPages:1}}:{})}));}
beforeEach(()=>{resetCsrfTokenCacheForTests();vi.spyOn(window,'confirm').mockReturnValue(true);});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function mock(goals:unknown[]){const fetchMock=vi.fn(async(input:unknown,init?:RequestInit)=>{
 const path=String(input);if(path.includes('/settings'))return response({household_timezone:'America/Los_Angeles',currency:'USD'});
 if(path.includes('/csrf-token'))return response({csrfToken:'token'});
 if(path.includes('/accounts'))return response([{id:'a1',name:'Savings',type:'savings',archived_at:null},{id:'a2',name:'Checking',type:'checking',archived_at:null}]);
 return response(init?.method==='POST'?goal:goals);
});vi.stubGlobal('fetch',fetchMock);return fetchMock;}
test('goal form explains allocation and submits exact positive cents without a transaction',async()=>{
 const fetchMock=mock([]);render(<MemoryRouter initialEntries={['/goals']}><App/></MemoryRouter>);
 await screen.findByLabelText('Goal name');expect(screen.getByText(/existing balance contributes/i)).toBeInTheDocument();expect(screen.getByText(/one active goal per savings account/i)).toBeInTheDocument();
 await userEvent.type(screen.getByLabelText('Goal name'),'Emergency');await userEvent.type(screen.getByLabelText('Target amount'),'100.00');await userEvent.selectOptions(screen.getByLabelText('Savings account'),'a1');await userEvent.click(screen.getByRole('button',{name:'Create goal'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));const call=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');expect(String(call?.[0])).toBe('/api/v1/goals');expect(JSON.parse(String(call?.[1]?.body))).toEqual({name:'Emergency',targetCents:10000,savingsAccountId:'a1',deadline:null});expect(fetchMock.mock.calls.some(([path])=>String(path).includes('/transactions'))).toBe(false);
});
test('current progress shows capped percentage/surplus and completion sends loaded revision',async()=>{
 const fetchMock=mock([goal]);render(<MemoryRouter initialEntries={['/goals']}><App/></MemoryRouter>);
 expect(await screen.findByText(/Surplus: \$20.00/)).toBeInTheDocument();expect(screen.getByText(/100%/)).toBeInTheDocument();expect(screen.getByText(/Current progress/)).toBeInTheDocument();await userEvent.click(screen.getByRole('button',{name:'Complete Emergency'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([path])=>String(path).endsWith('/g1/complete'))).toBe(true));const call=fetchMock.mock.calls.find(([path])=>String(path).endsWith('/g1/complete'));expect(JSON.parse(String(call?.[1]?.body))).toEqual({expectedRevision:2});
});
