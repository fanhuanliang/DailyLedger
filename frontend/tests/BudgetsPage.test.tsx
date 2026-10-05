import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach,afterEach,describe,test,expect,vi} from 'vitest';
import {App} from '../src/App';
import {resetCsrfTokenCacheForTests} from '../src/api/client';
const budget={year:2026,revision:null,overallLimitCents:null,netSpendingCents:3000,overallRemainingCents:null,categoryRows:[{categoryId:'c1',name:'Groceries',archivedAt:null,limitCents:null,netSpendingCents:3000,remainingCents:null}]};
function response(data:unknown){return new Response(JSON.stringify({data}));}
describe('AC8 annual budgets screen',()=>{
  beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-04T18:00:00Z'));resetCsrfTokenCacheForTests();vi.spyOn(window,'confirm').mockReturnValue(true);});
  afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
  test('zero is saved explicitly and blank category limits stay unset',async()=>{
    const fetchMock=vi.fn(async(input:unknown,init?:RequestInit)=>String(input).includes('/settings')?response({household_timezone:'America/Los_Angeles',currency:'USD'}):String(input).includes('/csrf-token')?response({csrfToken:'token'}):init?.method==='PUT'?response({...budget,revision:1,overallLimitCents:0,overallRemainingCents:-3000}):response(budget));
    vi.stubGlobal('fetch',fetchMock);render(<MemoryRouter initialEntries={['/budgets']}><App/></MemoryRouter>);
    const overall=await screen.findByLabelText('Overall limit');await userEvent.type(overall,'0.00');await userEvent.click(screen.getByRole('button',{name:'Save budget'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='PUT')).toBe(true));
    const call=fetchMock.mock.calls.find(([,init])=>init?.method==='PUT');expect(JSON.parse(String(call?.[1]?.body))).toEqual({expectedRevision:null,overallLimitCents:0,categoryLimits:[]});
    expect(screen.getByLabelText('Groceries limit')).toHaveValue('');expect(await screen.findByText('Remaining: -$30.00')).toBeInTheDocument();
  });
  test('copy uses only selected target year and explicit overwrite choice',async()=>{
    const fetchMock=vi.fn(async(input:unknown,_init?:RequestInit)=>String(input).includes('/settings')?response({household_timezone:'America/Los_Angeles',currency:'USD'}):String(input).includes('/csrf-token')?response({csrfToken:'token'}):response({...budget,revision:2,overallLimitCents:10000,overallRemainingCents:7000}));
    vi.stubGlobal('fetch',fetchMock);render(<MemoryRouter initialEntries={['/budgets']}><App/></MemoryRouter>);
    await screen.findByLabelText('Overall limit');await userEvent.click(screen.getByLabelText('Overwrite existing target limits'));await userEvent.click(screen.getByRole('button',{name:'Copy previous year'}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
    const call=fetchMock.mock.calls.find(([,init])=>init?.method==='POST');expect(String(call?.[0])).toBe('/api/v1/budgets/2026/copy');expect(JSON.parse(String(call?.[1]?.body))).toEqual({sourceYear:2025,overwrite:true,expectedRevision:2});
  });
});
