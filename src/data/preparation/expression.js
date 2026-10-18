/** Small, safe expression parser for serializable derived-column formulas. Column references use [Column Name]. */
export function parseExpression(source) {
  if (typeof source !== 'string' || !source.trim()) throw new TypeError('Enter an expression.');
  const tokens = tokenize(source); let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  function primary() {
    const token = take();
    if (!token) throw new SyntaxError('Unexpected end of expression.');
    if (token.type === 'number') return {kind:'literal', value:Number(token.value)};
    if (token.type === 'string') return {kind:'literal', value:token.value};
    if (token.type === 'column') return {kind:'column', name:token.value};
    if (token.value === '(') { const node = logicalOr(); if (take()?.value !== ')') throw new SyntaxError('Expected closing parenthesis.'); return node; }
    if (token.value === '+' || token.value === '-') return {kind:'unary', op:token.value, value:primary()};
    if (token.type === 'identifier') {
      const name = token.value.toUpperCase();
      if (name === 'NOT') return {kind:'not', value:primary()};
      if (take()?.value !== '(') throw new SyntaxError(`Unknown identifier "${token.value}". Use [Column Name] for column references.`);
      const args=[];
      if (peek()?.value !== ')') { do { args.push(logicalOr()); if (peek()?.value !== ',') break; take(); } while (true); }
      if (take()?.value !== ')') throw new SyntaxError(`Expected closing parenthesis after ${name}.`);
      const arity = {YEAR:1,MONTH:1,DAY:1,FORMAT_MONTH:1,TRIM:1,LOWER:1,UPPER:1,CONCAT:[1,20],ABS:1,ROUND:[1,2],IF:3,IS_MISSING:1}[name];
      if (!arity) throw new SyntaxError(`Unsupported function "${name}".`);
      const valid = Array.isArray(arity) ? args.length >= arity[0] && args.length <= arity[1] : args.length === arity;
      if (!valid) throw new SyntaxError(`${name} received an invalid number of arguments.`);
      return {kind:'call', name, args};
    }
    throw new SyntaxError(`Unexpected token "${token.value}".`);
  }
  function multiplicative() { let node=primary(); while (['*','/','%'].includes(peek()?.value)) { const op=take().value; node={kind:'binary',op,left:node,right:primary()}; } return node; }
  function additive() { let node=multiplicative(); while (['+','-'].includes(peek()?.value)) { const op=take().value; node={kind:'binary',op,left:node,right:multiplicative()}; } return node; }
  function comparison() { let node=additive(); while (['>','>=','<','<=','==','!='].includes(peek()?.value)) { const op=take().value; node={kind:'binary',op,left:node,right:additive()}; } return node; }
  function logicalAnd() { let node=comparison(); while (peek()?.type==='identifier' && peek().value.toUpperCase()==='AND') { take(); node={kind:'logical',op:'AND',left:node,right:comparison()}; } return node; }
  function logicalOr() { let node=logicalAnd(); while (peek()?.type==='identifier' && peek().value.toUpperCase()==='OR') { take(); node={kind:'logical',op:'OR',left:node,right:logicalAnd()}; } return node; }
  const ast=logicalOr(); if (position !== tokens.length) throw new SyntaxError(`Unexpected token "${peek().value}".`); return ast;
}
function tokenize(source) {
  const tokens=[]; let i=0;
  while (i<source.length) {
    if (/\s/.test(source[i])) { i++; continue; }
    const rest=source.slice(i); let m;
    if ((m=/^\[([^\]]+)\]/.exec(rest))) { tokens.push({type:'column',value:m[1].trim()}); i+=m[0].length; continue; }
    if ((m=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest))) { tokens.push({type:'number',value:m[0]}); i+=m[0].length; continue; }
    if ((m=/^"((?:[^"\\]|\\.)*)"/.exec(rest))) { tokens.push({type:'string',value:m[1].replace(/\\"/g,'"').replace(/\\\\/g,'\\')}); i+=m[0].length; continue; }
    if ((m=/^(?:>=|<=|==|!=|>|<)/.exec(rest))) { tokens.push({type:'operator',value:m[0]}); i+=m[0].length; continue; }
    if ((m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { tokens.push({type:'identifier',value:m[0]}); i+=m[0].length; continue; }
    if ('+-*/%(),'.includes(source[i])) { tokens.push({type:'symbol',value:source[i++]}); continue; }
    throw new SyntaxError(`Unsupported character "${source[i]}".`);
  }
  return tokens;
}
export function evaluateExpression(ast, row) {
  const evaluate=node=>{
    if(node.kind==='literal') return node.value;
    if(node.kind==='column') { if(!Object.hasOwn(row,node.name)) throw new Error(`Missing source column "${node.name}".`); return row[node.name]; }
    if(node.kind==='unary') { const n=number(evaluate(node.value)); return n===null?null:(node.op==='-'?-n:n); }
    if(node.kind==='not') { const value=evaluate(node.value); return isMissing(value)?null:!truthy(value); }
    if(node.kind==='logical') {
      const a=evaluate(node.left); if(node.op==='AND' && !isMissing(a) && !truthy(a)) return false;
      if(node.op==='OR' && !isMissing(a) && truthy(a)) return true;
      const b=evaluate(node.right); if(isMissing(a)||isMissing(b)) return null;
      return node.op==='AND' ? truthy(a)&&truthy(b) : truthy(a)||truthy(b);
    }
    if(node.kind==='binary') {
      const left=evaluate(node.left), right=evaluate(node.right);
      if(['>','>=','<','<=','==','!='].includes(node.op)) {
        if(isMissing(left)||isMissing(right)) return null;
        const a=number(left), b=number(right);
        if (['>','>=','<','<='].includes(node.op) && ((a===null && b!==null) || (a!==null && b===null))) return null;
        const comparable = a!==null && b!==null ? [a,b] : [String(left),String(right)];
        const [x,y]=comparable;
        return node.op==='>'?x>y:node.op==='>='?x>=y:node.op==='<'?x<y:node.op==='<='?x<=y:node.op==='=='?x===y:x!==y;
      }
      const a=number(left), b=number(right); if(a===null||b===null||(node.op==='/'&&b===0)||(node.op==='%'&&b===0)) return null;
      const v=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:node.op==='/'?a/b:a%b; return Number.isFinite(v)?v:null;
    }
    if(node.kind==='call') {
      if(node.name==='IS_MISSING') return isMissing(evaluate(node.args[0]));
      if(node.name==='IF') { const condition=evaluate(node.args[0]); if(isMissing(condition)) return null; return evaluate(node.args[truthy(condition)?1:2]); }
      const values=node.args.map(evaluate); if(values.some(isMissing)) return null;
      const value=values[0];
      if(node.name==='CONCAT') return values.map(String).join('');
      if(node.name==='TRIM') return String(value).trim(); if(node.name==='LOWER') return String(value).toLowerCase(); if(node.name==='UPPER') return String(value).toUpperCase();
      if(node.name==='ABS') { const n=number(value); return n===null?null:Math.abs(n); }
      if(node.name==='ROUND') { const n=number(value), places=values.length===2?number(values[1]):0; if(n===null||places===null||places<0||places>10)return null; const p=10**places; return Math.round((n+Number.EPSILON)*p)/p; }
      const date=new Date(String(value)); if(!Number.isFinite(date.getTime())) return null;
      if(node.name==='YEAR') return date.getUTCFullYear(); if(node.name==='MONTH') return date.getUTCMonth()+1; if(node.name==='DAY') return date.getUTCDate();
      if(node.name==='FORMAT_MONTH') return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
      return null;
    }
    return null;
  };
  return evaluate(ast);
}
function isMissing(value) { return value == null || (typeof value==='string' && value.trim()===''); }
function truthy(value) { if(typeof value==='boolean') return value; if(typeof value==='number') return value!==0; if(typeof value==='string') return value.length>0; return false; }
function number(value) { if(typeof value==='number') return Number.isFinite(value)?value:null; if(value==null||String(value).trim()==='')return null; const n=Number(value); return Number.isFinite(n)?n:null; }
export function expressionColumns(ast) { const found=new Set(); const visit=n=>{if(n.kind==='column')found.add(n.name); if(n.value&&typeof n.value==='object')visit(n.value); if(n.left)visit(n.left);if(n.right)visit(n.right);for(const a of n.args??[])visit(a);}; visit(ast); return [...found]; }
