import React, { Component } from 'react';

import './App.css';
import '../node_modules/dc/dc.css';
import '../node_modules/bootstrap/dist/css/bootstrap.css';
// import '../node_modules/react-vis/main.css';

import {csv} from 'd3-request';
import {format} from 'd3-format';
import {scaleLinear, scaleTime} from 'd3-scale';
import {timeMonth, timeMonths, timeYear} from 'd3-time';
import {timeParse, timeFormat} from 'd3-time-format';

import {ChartContainer, PieChart, RowChart, BubbleChart,
        DataTable, DataCount, BarChart, LineChart} from 'dc-react';

import dc from 'dc';
import crossfilter from 'crossfilter';
import colorbrewer from 'colorbrewer';


class CrossfilterContext {
  constructor(data) {
    this.data = data;

    this.crossfilter = crossfilter(data);
    this.groupAll = this.crossfilter.groupAll();

    //-- Dimension by full year -------------//
    this.yearlyDimension = this.crossfilter.dimension(d => d.year);
    //-- Maintain running tallies by year as filters are applied or removed
    this.yearlyPerformanceGroup = this.yearlyDimension.group().reduce(
      /* callback for when data is added to the current filter results */
      (p, v) => {
        ++p.count;
        p.absGain += v.close - v.open;
        p.fluctuation += Math.abs(v.close - v.open);
        p.sumIndex += (v.open + v.close) / 2;
        p.avgIndex = p.sumIndex / p.count;
        p.percentageGain = p.avgIndex ? (p.absGain / p.avgIndex) * 100 : 0;
        p.fluctuationPercentage = p.avgIndex ? (p.fluctuation / p.avgIndex) * 100 : 0;
        return p;
      },//1
      /* callback for when data is removed from the current filter results */
      (p, v) => {
        --p.count;
        p.absGain -= v.close - v.open;
        p.fluctuation -= Math.abs(v.close - v.open);
        p.sumIndex -= (v.open + v.close) / 2;
        p.avgIndex = p.count ? p.sumIndex / p.count : 0;
        p.percentageGain = p.avgIndex ? (p.absGain / p.avgIndex) * 100 : 0;
        p.fluctuationPercentage = p.avgIndex ? (p.fluctuation / p.avgIndex) * 100 : 0;
        return p;
      },//2
      /* initialize p */
      () => {
        return {
          count: 0,
          absGain: 0,
          fluctuation: 0,
          fluctuationPercentage: 0,
          sumIndex: 0,
          avgIndex: 0,
          percentageGain: 0
        };
      }//3
    );

    //-- Dimension by full date --------//
    this.dateDimension = this.crossfilter.dimension(d => d.dd);

    //-- Dimension by month ------------//
    this.moveMonthsDimension = this.crossfilter.dimension(d => d.month);
    //-- Group by 'total' movement within month
    this.moveMonthsGroup = this.moveMonthsDimension.group().reduceSum(d => Math.abs(d.change));
    this.indexAvgByMonthGroup = this.moveMonthsDimension.group().reduce(
      (p, v) => {
        ++p.days;
        p.total += (v.open + v.close) / 2;
        p.avg = Math.round(p.total / p.days);
        return p;
      },
      (p, v) => {
          --p.days;
          p.total -= (v.open + v.close) / 2;
          p.avg = p.days ? Math.round(p.total / p.days) : 0;
          return p;
      },
      () => {
        return {days: 0, total: 0, avg: 0};
      }
    );
    //-- Group by 'total' volume within move, and scale down result
    this.volumeByMonthGroup = this.moveMonthsDimension.group().reduceSum(d => d.volume / 500000);

    //-- Create categorical dimension --//
    this.gainOrLossDimension = this.crossfilter.dimension(d => d.open > d.close ? 'Loss' : 'Gain');
    //-- Produce counts records in the dimension
    this.gainOrLossGroup = this.gainOrLossDimension.group();

    //-- Determine a histogram of percent changes
    this.fluctuationDimension = this.crossfilter.dimension(d => Math.round(d.change / d.open * 100));
    this.fluctuationGroup = this.fluctuationDimension.group();

    //-- Summarize volume by quarter ---//
    this.quarterDimension = this.crossfilter.dimension((d) => {
      let quarter = Math.floor(d.dd.getMonth() / 3) + 1;
      return `Q${quarter}`;
    });
    this.quarterGroup = this.quarterDimension.group().reduceSum(d => d.volume);

    //-- Counts per weekday ------------//
    this.dayOfWeekDimension = this.crossfilter.dimension((d) => {
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let day = d.dd.getDay();
      return `${day}.${dayLabels[day]}`;
    });
    this.dayOfWeekGroup = this.dayOfWeekDimension.group();   
  }//constructor
}

//----------------------------------------//
const dateFormat = timeFormat('%m/%d/%Y');
const numberFormat = format('.2f');
//----------------------------------------//
class App extends Component {
  constructor(props) {
    super(props);
    this.state = {};
    this._crossfilterContext = null;
    this.crossfilterContext = this.crossfilterContext.bind(this);
    this.resetAll = this.resetAll.bind(this);
  }

  crossfilterContext = (callback) => {
    //-- this is called in the "componentDidMount" in the ChartContainer
    if (!callback) {
      return this._crossfilterContext;
    }
    csv('./data/ndx.csv', (data) => {
      const dateParse = timeParse('%m/%d/%Y');  //== d3.time.format('[]').parse;
      const lastIndex = data.length - 1;
      data.forEach( (d, i) => { 
        d.dd = dateParse(d.date);   // Mon Nov 04 1985 00:00:00 GMT-0500 (EST)
        d.month = timeMonth(d.dd);  // pre-calculate month for better performance
        d.year = timeYear(d.dd).getFullYear();
        d.close = +d.close;
        d.open = +d.open;
        d.change = numberFormat(d.close - d.open);

        if (i === 0) {
          this.setState({firstDate: dateFormat(d.dd)});
        } else if (i === lastIndex) {
          this.setState({lastDate: dateFormat(d.dd)});
        }
      });
      this._crossfilterContext = new CrossfilterContext(data);
      callback(this._crossfilterContext);
    });
  }

  resetAll() {
    dc.filterAll();
    dc.redrawAll();
  }

  render() {
    const {firstDate, lastDate} = this.state;
    return (
      <div className="App">
        <div className="App-header">
          <h2>Nasdaq 100 Index ({firstDate} - {lastDate})</h2>
        </div>
        <div className='Chart-holder'>
          <ChartContainer className='container' crossfilterContext={this.crossfilterContext}>
            <div className="row" style={{marginLeft:'2px', width: '925px'}}>
              <DataCount 
                className="dc-data-count"
                dimension={ctx => ctx.crossfilter}
                group={ctx => ctx.groupAll} />
              <div className="dc-data-count"><a className="reset" style={{fontWeight: 'bold', textDecoration: 'underline', cursor:'pointer'}} onClick={this.resetAll}>Reset All</a></div>
            </div>

            <div className='Chart-title' style={{marginTop: '25px'}}>Yearly Performance&nbsp;
              <span style={{fontSize: 14, fontWeight: 'normal'}}>(radius: fluctuation/index ratio, color: gain/loss)&nbsp;</span>
            </div>
            <div className='row'>
              <BubbleChart
                className="dc-chart"
                ref="yearlyBubbleChart"
                dimension={ctx => ctx.yearlyDimension}
                group={ctx => ctx.yearlyPerformanceGroup}
                width={990} height={250}
                margins={{top: 10, right: 5, bottom: 35, left: 35}}
                renderHorizontalGridLines={true}
                renderVerticalGridLines={true}
                xAxisLabel='Index Gain'
                yAxisLabel='Index Gain %'
                yAxis={axis => axis.ticks(7)}
                label={p => p.key}
                title={(p) => {
                  return [
                    p.key,
                    'Index Gain: ' + numberFormat(p.value.absGain),
                    'Index Gain in Percentage: ' + numberFormat(p.value.percentageGain) + '%',
                    'Fluctuation / Index Ratio: ' + numberFormat(p.value.fluctuationPercentage) + '%'
                  ].join('\n');
                }}
                transitionDuration={1500}
                colorAccessor={d => d.value.absGain}
                keyAccessor={p => p.value.absGain}
                valueAccessor={p => p.value.percentageGain}
                radiusValueAccessor={p => p.value.fluctuationPercentage}
                x={scaleLinear().domain([-2250, 2250])}
                y={scaleLinear().domain([-150, 150])}
                r={scaleLinear().domain([0, 4000])}
                colorDomain={[-500, 500]} 
                colors={colorbrewer.RdYlGn[9]} />
            </div>

            <div className='Chart-title'>
              <span style={{marginLeft: 0}}>Days by Gain/Loss</span>
              <span style={{marginLeft: 80}}>Quarters</span>
              <span style={{marginLeft: 130}}>Day of Week</span>
              <span style={{marginLeft: 140}}>Days by Fluctuation(%)</span>
            </div>
            <div className="row">
              <PieChart
                className="dc-data-count"
                id="gainOrLossChart"
                dimension={ctx => ctx.gainOrLossDimension}
                group={ctx => ctx.gainOrLossGroup}
                width={180} height={180}
                radius={80}
                label={(d) => {
                  let percent = Math.floor(d.value / this.crossfilterContext().groupAll.value() * 100);
                  return `${d.key}(${percent}%)`;
                }} />
              <PieChart
                className="dc-data-count"
                id="quarterChart"
                dimension={ctx => ctx.quarterDimension}
                group={ctx => ctx.quarterGroup}
                width={180} height={180}
                radius={80} innerRadius={30} />
              <RowChart
                className="dc-data-count"
                id="dayOfWeekChart"
                dimension={ctx => ctx.dayOfWeekDimension}
                group={ctx => ctx.dayOfWeekGroup}
                width={180} height={180}
                margins={{top: 10, right: 10, bottom: 20, left: 10}}
                label={d => d.key.split('.')[1]}
                title={d => d.value}
                elasticX={true}
                xAxis={axis => axis.ticks(4)} />
              <BarChart
                className="dc-data-count"
                id="fluctuationChart"
                dimension={ctx => ctx.fluctuationDimension}
                group={ctx => ctx.fluctuationGroup}
                width={420} height={180}
                margins={{top: 10, right: 20, bottom: 20, left: 40}}
                elasticY={true}
                centerBar={true}
                gap={1}
                round={dc.round.floor}
                alwaysUseRounding={true}
                x={scaleLinear().domain([-25, 25])}
                renderHorizontalGridLines={true} 
                filterPrinter={(filters) => {
                    let filter = filters[0];
                    let s = '';
                    s += numberFormat(filter[0]) + '% -> ' + numberFormat(filter[1]) + '%';
                    return s;
                }} 
                yAxis={axis => axis.ticks(5)} />
            </div>

            <div className='Chart-title'>Monthly Index Abs Move & Volume/500,000 Chart</div>
            <div className="row">
              <LineChart
                id="moveChart"
                dimension={ctx => ctx.moveMonthsDimension}
                group={ctx => [ctx.indexAvgByMonthGroup, 'Monthly Index Average']}
                renderArea={true}
                width={990} height={200}
                transitionDuration={1000}
                margins={{top: 30, right: 0, bottom: 25, left: 40}}
                mouseZoomable={true}
                x={scaleTime().domain([new Date(1985, 0, 1), new Date(2012, 11, 31)])}
                round={timeMonth.round}
                xUnits={timeMonths}
                elasticY={true}
                renderHorizontalGridLines={true}
                legend={dc.legend().x(800).y(10).itemHeight(13).gap(5)}
                brushOn={false}
                valueAccessor={d => d.value.avg}
                title={(d) => {
                  let value = d.value.avg ? d.value.avg : d.value;
                  if (isNaN(value)) {
                    value = 0;
                  }

                  return `${dateFormat(d.key)}\n${numberFormat(value)}`;
                }}
                stack={ctx => [ctx.moveMonthsGroup, 'Monthly Index Move', (d) => { return d.value; }]} />
            </div>
            <div className="row">
              <BarChart
                id="volumeChart"
                dimension={ctx => ctx.moveMonthsDimension}
                group={ctx => ctx.volumeByMonthGroup}
                width={990} height={60}
                margins={{top: 10, right: 0, bottom: 20, left: 40}}
                elasticY={true}
                centerBar={true}
                gap={1}
                round={timeMonth.round}
                alwaysUseRounding={true}
                x={scaleTime().domain([new Date(1985, 0, 1), new Date(2012, 11, 31)])} 
                yAxis={axis => axis.ticks(0)} />
            </div>

            <div className='Chart-title'>&nbsp;</div>
            <div className="row" style={{marginLeft:'0px', marginTop: '10px', width: '925px'}}>
              <DataTable
                className="table table-hover" 
                id="nasdaqTable"
                dimension={ctx => ctx.dateDimension}
                group={d => `${d.dd.getMonth()+1}/${d.dd.getFullYear()}`}
                columns={['date', 'open', 'close', 'change', 'volume']} />
            </div>
            <div className="clearfix" />
          </ChartContainer>
        </div>
      </div>
    );
  }
}
export default App;