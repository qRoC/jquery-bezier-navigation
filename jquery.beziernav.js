/*! jquery-bezier-navigation - Copyright 2015 Andrey <qRoC.Work@gmail.com> Savitskiy */
(function($)
{
    'use strict';

    // ========================================================================
    function factorial(n) { return (n <= 1) ? 1 : n * factorial(n - 1); }

    function Vec2(x, y)
    {
        this.x = x;
        this.y = y;
    }

    function fillArray(array, val, repeat)
    {
        for (var i = 0; i < repeat; i++)
            array.push(val);
    }

    // ========================================================================
    /**
     * @param Array[] pivot_points Массив опорных точек. В формате [x, y].
     * @param double step Шаг при расчёте кривой. От 0 до 1.
     */
    function Bezier(pivot_points, step)
    {
        this.points = [];
        this.pivot_points = pivot_points;

        for (var t = 0; t < 1 + step; t += step)
        {
            if (t > 1) t = 1;

            var point = new Vec2(0, 0);

            for (var i = 0; i < this.pivot_points.length; i++)
            {
                var b = this.getBasis(i, this.pivot_points.length - 1, t);

                point.x += this.pivot_points[i][0] * b;
                point.y += this.pivot_points[i][1] * b;
            }

            this.points.push(point);
        }
    }

    /**
     * Возвращает i-й элемент полинома Берштейна.
     *
     * @param i Номер вершины.
     * @param n Количество вершин.
     * @param t Положение кривой. От 0 до 1.
     */
    Bezier.prototype.getBasis = function(i, n, t)
    {
        return (factorial(n) / (factorial(i) * factorial(n - i))) * Math.pow(t, i) * Math.pow(1 - t, n - i);
    }

    Bezier.prototype.getPoints = function()
    {
        return this.points;
    }

    Bezier.prototype.debugRender = function($obj)
    {
        var $point = $( "<div />" );

        $point.css({
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1px',
            height: '1px',
            backgroundColor: '#000'
        });

        for (var i = 0; i < this.points.length; i++)
        {
            var $point_tmp = $point.clone(false);

            $point_tmp.css({
                left: this.points[i].x,
                top:  this.points[i].y
            });

            $obj.append($point_tmp);
        }

        for (var i = 0; i < this.pivot_points.length; i++)
        {
            var $point_tmp = $point.clone(false);

            $point_tmp.css({
                left: this.pivot_points[i][0],
                top:  this.pivot_points[i][1],
                width: '4px',
                height: '4px',
                backgroundColor: '#ff0000'
            });

            $obj.append($point_tmp);
        }
    }

    // ========================================================================
    function BezierNav($obj, options)
    {
        var settings = $.extend({
            '$parent': $obj,

            'bezier_points': [],                            // Опорные точки. В формате [x, y].
            'bezier_step': 0.01,                            // Шаг для расчёта кривой. От 0 до 1.
            'bezier_render': false,                         // Рендерить ли базье. Только для отладки.

            'menu': [],                                     // Элементы меню. Массив из идентификаторов.
            'menu_item_correction': function($el, key){},   // Колбек для корректировки отображения элементов меню.
            'menu_padding': 5,                              // Отступ между элементами меню. Зависит от bezier_step.
            'menu_active_padding': 15,                      // Отступ от активного элемента меню. Зависит от bezier_step.
            'menu_default_active': undefined                // Активный пункт меню по умолчанию.
        }, options);

        //
        var bezier = new Bezier(settings.bezier_points, settings.bezier_step);

        if (settings.bezier_render)
            bezier.debugRender(settings.$parent);

        this.road_points = bezier.getPoints();
        this.menu_items  = prepareMenuItems(settings.menu, settings.menu_item_correction);
        this.active      = undefined;
        this.tasks       = [];

        this.menu_padding        = settings.menu_padding;
        this.menu_active_padding = settings.menu_active_padding;

        if (typeof settings.menu_default_active !== 'undefined')
            this.setActiveById(settings.menu_default_active);
        else
            this.setActive(0);

        for (var i = 0; i < this.menu_items.length; i++)
            settings.$parent.append(this.menu_items[i].$el);
    };

    function prepareMenuItems(items, cb)
    {
        var $blueprint = $( "<div class='menu_item'/>" );

        $blueprint.css({
            position: 'absolute',
            top:  0,
            left: 0
        });

        var menu_items = [];

        for (var i = 0; i < items.length; i++)
        {
            var $el = $blueprint.clone(false),
                id  = items[i];

            cb($el, id);

            menu_items.push({
                id: id,
                $el: $el,
                point_n: -1
            });
        }

        return menu_items;
    }

    BezierNav.prototype.menuSearchPosById = function(id)
    {
        for (var pos = 0; pos < this.menu_items.length; pos++)
            if (this.menu_items[pos].id == id)
                return pos;

        throw new Error("Bad element id");
    }

    function setPossition(item, points, point_n)
    {
        if (point_n < 0 || point_n >= points.lenght)
            return;

        item.point_n = point_n;

        var point = points[item.point_n];

        item.$el.css({
            left: point.x - item.$el.width() / 2,
            top:  point.y - item.$el.height() / 2
        });
    }

    function moveByPointRoad(item, points, queue, toleft, _tasks)
    {
        _tasks.push(undefined);

        var start_point_n = item.point_n;
        var shift = toleft ? -1 : 1;

        requestAnimationFrame(function animate()
        {
            setPossition(item, points, item.point_n + shift);

            if (toleft && start_point_n - item.point_n === queue[0])
            {
                start_point_n = item.point_n;
                queue.shift();
            }
            else if (!toleft && start_point_n + queue[0] === item.point_n)
            {
                start_point_n = item.point_n;
                queue.shift();
            }

            if (queue.length)
                requestAnimationFrame(animate);
            else
                _tasks.pop();
        });
    }

    BezierNav.prototype.$innerSampleMove = function(pos)
    {
        var central_point = Math.floor(this.road_points.length / 2);
        var left_point    = central_point - this.menu_active_padding;
        var right_point   = central_point + this.menu_active_padding;

        // center
        setPossition(this.menu_items[pos], this.road_points, central_point);

        // left
        for (var i = pos - 1; i >= 0; i--)
        {
            setPossition(this.menu_items[i], this.road_points, left_point);
            left_point -= this.menu_padding;
        }

        // right
        for (var i = pos + 1; i < this.menu_items.length; i++)
        {
            setPossition(this.menu_items[i], this.road_points, right_point);
            right_point += this.menu_padding;
        }
    }

    BezierNav.prototype.$innerAnimationMove = function(pos)
    {
        var diff   = pos - this.active,
            toleft = false,
            menu   = this.menu_items,
            active = this.active;

        if (diff > 0)
            toleft = true;
        else
        {
            diff = Math.abs(diff);

            menu   = this.menu_items.slice().reverse();
            active = this.menu_items.length - active - 1;
        }

        for (var i = 0; i < menu.length; i++)
        {
            var item  = menu[i];
            var queue = [];

            if (i < active) // Уже в стороне направления
            {
                fillArray(queue, this.menu_padding, diff);
            }
            else if(i == active) // Смещение активного элемента.
            {
                fillArray(queue, this.menu_active_padding, 1); // Уходим в сторону
                fillArray(queue, this.menu_padding, diff - 1); // Стандартное смещение в сторону направления
            }
            else if (i - diff == active) // Справа, переходит в центральное положение
            {
                fillArray(queue, this.menu_padding, diff - 1); // Подходим к центру
                fillArray(queue, this.menu_active_padding, 1); // Ставим в центр
            }
            else if (i - diff < active) // Проходит через центр в сторону направления
            {
                fillArray(queue, this.menu_padding, i - active - 1); // Подходим к центру
                fillArray(queue, this.menu_active_padding, 2);       // Проходим центр
                fillArray(queue, this.menu_padding, diff - (i - active) - 1); // Стандартное смещение в сторону направления
            }
            else // В стороне
            {
                fillArray(queue, this.menu_padding, diff);
            }

            moveByPointRoad(item, this.road_points, queue, toleft, this.tasks);
        }
    }

    BezierNav.prototype.setActiveById = function(id)
    {
        this.setActive(this.menuSearchPosById(id));
    }

    BezierNav.prototype.setActive = (function()
    {
        var __first_render = true;

        return function(pos)
        {
            if (this.tasks.length)
                return;

            if (typeof this.active !== 'undefined')
            {
                if (this.active == pos)
                    return;

                this.menu_items[this.active].$el.removeClass("active");
            }

            if (__first_render)
            {
                this.$innerSampleMove(pos);

                __first_render = false;
            }
            else
            {
                this.$innerAnimationMove(pos);
            }

            this.active = pos;

            this.menu_items[this.active].$el.addClass("active");
        }
    })();

    BezierNav.prototype.next = function()
    {
        if (this.active == this.menu_items.length - 1)
            var pos = 0;
        else
            var pos = this.active + 1;

        this.setActive(pos);
    }

    BezierNav.prototype.prev = function()
    {
        if (this.active == 0)
            var pos = this.menu_items.length - 1;
        else
            var pos = this.active - 1;

        this.setActive(pos);
    }

    // ========================================================================
    var bezier_nav = {};

    $.fn.bezierNav = function(data)
    {
        var $obj = this;
        var id   = $obj.attr('id');

        if (!id)
        {
            id = 'bezier_nav_' + Date.now();

            $obj.attr('id', id);
        }

        if (!bezier_nav.hasOwnProperty(id))
            bezier_nav[id] = new BezierNav($obj, data);
        else if (data in bezier_nav[id] && data[0] != '$')
            return bezier_nav[id][data].apply(bezier_nav[id], Array.prototype.slice.call(arguments, 1));
        else
            $.error('Bad method name: ' + data);
    };

})(jQuery);
