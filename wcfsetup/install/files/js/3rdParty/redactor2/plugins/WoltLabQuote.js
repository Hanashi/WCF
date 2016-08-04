$.Redactor.prototype.WoltLabQuote = function() {
	"use strict";
	
	return {
		init: function() {
			var button = this.button.add('woltlabQuote', '');
			
			require(['WoltLabSuite/Core/Ui/Redactor/Quote'], (function (UiRedactorQuote) {
				new UiRedactorQuote(this, button);
			}).bind(this));
		}
	};
};
